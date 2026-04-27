/**
 * Topik 9: Worker Connected to Real Agent
 *
 * Jalankan: npx tsx src/agents/experiments/workerAgentDemo.ts
 *
 * Yang kamu pelajari:
 * 1. BullMQ job lifecycle: queued → active → completed
 * 2. Worker memproses job dengan orchestrator sungguhan (bukan mock)
 * 3. Agent session tersimpan di DB untuk audit trail
 * 4. ContentDraft tersimpan dengan status PENDING_REVIEW
 * 5. Circuit breaker melindungi orchestrator dari Claude API failure
 * 6. Semua langkah ter-trace di Langfuse (jika dikonfigurasi)
 *
 * Prerequisite: docker compose up -d (PostgreSQL + Redis)
 */
import { Queue, QueueEvents } from 'bullmq'
import { redisConnection, type GenerateContentPayload } from '../../lib/queue.js'
import { createGenerateContentWorker } from '../../jobs/generateContent.job.js'
import { db } from '../../lib/db.js'
import { flushLangfuse, langfuse } from '../../lib/langfuse.js'
import { logger } from '../../lib/logger.js'

async function checkPrerequisites(): Promise<void> {
    console.log('Mengecek prerequisites...')

    try {
        await db.$queryRaw`SELECT 1`
        console.log('  ✓ PostgreSQL connected')
    } catch {
        console.error('  ✗ PostgreSQL tidak bisa diakses')
        console.error('    Jalankan: docker compose up -d')
        process.exit(1)
    }

    try {
        await redisConnection.ping()
        console.log('  ✓ Redis connected')
    } catch {
        console.error('  ✗ Redis tidak bisa diakses')
        console.error('    Jalankan: docker compose up -d')
        process.exit(1)
    }

    if (langfuse) {
        console.log('  ✓ Langfuse aktif — trace akan muncul di dashboard')
    } else {
        console.log('  ℹ Langfuse tidak dikonfigurasi (opsional)')
    }
}

async function showResults(jobId: string): Promise<void> {
    // Lihat ContentDraft yang baru dibuat
    const drafts = await db.contentDraft.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
    })

    if (drafts.length > 0) {
        const draft = drafts[0]!
        console.log('\n📄 ContentDraft tersimpan di DB:')
        console.log(`   ID         : ${draft.id}`)
        console.log(`   Status     : ${draft.status}  ← siap untuk di-review`)
        console.log(`   Pillar     : ${draft.contentPillar}`)
        console.log(`   Post Time  : ${draft.bestPostTime ?? 'tidak ada'}`)
        console.log(`   Caption    : ${draft.caption.slice(0, 80)}...`)
        console.log(`   Hashtags   : ${draft.hashtags.slice(0, 4).join(', ')}...`)
        console.log(`   CreatedAt  : ${draft.createdAt.toISOString()}`)
    }

    // Lihat agent session yang dibuat oleh job ini
    const sessions = await db.agentSession.findMany({
        where: { jobId },
        orderBy: { startedAt: 'desc' },
        take: 1,
    })

    if (sessions.length > 0) {
        const session = sessions[0]!
        console.log('\n🧠 Agent Session (lifecycle tracking):')
        console.log(`   Session ID : ${session.id}`)
        console.log(`   Agent      : ${session.agentName}`)
        console.log(`   Status     : ${session.status}`)
        console.log(`   Job ID     : ${session.jobId}`)
        console.log(`   Started    : ${session.startedAt.toISOString()}`)
        console.log(`   Completed  : ${session.completedAt?.toISOString() ?? 'N/A'}`)

        if (session.status === 'COMPLETED') {
            console.log('   → Session COMPLETED = orchestrator berhasil, draft tersimpan')
        }
    }

    // Lihat job log
    const logs = await db.jobLog.findMany({
        where: { jobId },
        orderBy: { createdAt: 'desc' },
        take: 1,
    })

    if (logs.length > 0) {
        const log = logs[0]!
        console.log('\n📋 Job Log (audit trail):')
        console.log(`   Job Name   : ${log.jobName}`)
        console.log(`   Status     : ${log.status}`)
        console.log(`   Duration   : ${log.duration}ms`)
        if (log.error) console.log(`   Error      : ${log.error}`)
    }
}

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════╗')
    console.log('║  Topik 9: Worker Connected to Real Agent              ║')
    console.log('╚══════════════════════════════════════════════════════╝')
    console.log()

    await checkPrerequisites()

    // Buat worker in-process untuk demo ini
    // (di production, worker jalan di process terpisah via src/index.ts)
    console.log('\nMemulai worker in-process...')
    const worker = createGenerateContentWorker()

    // Queue untuk dispatch job
    const queue = new Queue<GenerateContentPayload>('generateContent', {
        connection: redisConnection,
    })
    const queueEvents = new QueueEvents('generateContent', {
        connection: redisConnection,
    })

    // Listen ke progress updates
    queueEvents.on('progress', ({ jobId, data }) => {
        process.stdout.write(`\r  Progress: ${data}%   `)
    })

    console.log('\nMen-dispatch job generateContent ke BullMQ...')

    const job = await queue.add(
        'generateContent',
        {
            topic: 'koleksi ramadan 2026',
            productType: 'dress batik modern',
            count: 1,
        },
        // Override default attempts untuk demo — tidak perlu retry 3x
        { attempts: 1 }
    )

    const jobId = job.id ?? 'unknown'
    console.log(`  ✓ Job dispatched! ID: ${jobId}`)
    console.log('\nMenunggu worker memproses...')
    console.log('Flow: job dispatched → worker picks up → agent session created')
    console.log('       → circuit breaker check → orchestrator runs → draft saved\n')

    try {
        // Tunggu job selesai dengan timeout 3 menit
        await job.waitUntilFinished(queueEvents, 180_000)
        process.stdout.write('\n')

        console.log('\n✅ Job berhasil!')
        await showResults(jobId)

        if (langfuse) {
            await flushLangfuse()
            console.log(`\n🔍 Langfuse trace:`)
            console.log(`   Cari trace ID: job-${jobId}-0`)
            console.log(`   Di: https://cloud.langfuse.com`)
        }

    } catch (error) {
        process.stdout.write('\n')
        const msg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`\n✗ Job gagal: ${msg}`)

        if (msg.includes('circuit')) {
            console.log('\n💡 Circuit Breaker aktif — Claude API sedang bermasalah')
            console.log('   Job akan otomatis diulangi setelah recovery timeout')
        }
    } finally {
        await flushLangfuse()
        await worker.close()
        await queue.close()
        await queueEvents.close()
        await db.$disconnect()
        logger.info('Demo cleanup done')
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Koneksi semua komponen:')
    console.log('  BullMQ job  → generateContent.job.ts (worker)')
    console.log('  Worker      → createAgentSession()   (memory)')
    console.log('  Worker      → claudeCircuitBreaker   (error recovery)')
    console.log('  Worker      → runContentOrchestrator (real agents)')
    console.log('  Orchestrator → Langfuse trace         (observability)')
    console.log('  Orchestrator → contentDraftRepository (persistence)')
}

main().catch(err => {
    console.error('Demo error:', err)
    process.exit(1)
})
