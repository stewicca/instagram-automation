import { Worker, type Job } from 'bullmq'
import { redisConnection, type GenerateContentPayload } from '../lib/queue.js'
import { contentDraftRepository } from '../repositories/contentDraft.repository.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { runContentOrchestrator } from '../agents/orchestrator.js'
import { createAgentSession } from '../lib/agentMemory.js'
import { CircuitBreaker, CircuitOpenError } from '../lib/circuitBreaker.js'
import { ContentPillar } from '../generated/prisma/enums.js'
import { telegram } from '../lib/telegram.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

/**
 * Circuit breaker untuk Claude API.
 *
 * Singleton per worker process — semua jobs berbagi state yang sama.
 * Ini penting: kalau job ke-1 sudah bikin Claude mati, job ke-2 langsung
 * tahu untuk tidak coba lagi (tanpa circuit breaker, job ke-2 tetap coba
 * dan buang-buang waktu + cost).
 */
const claudeCircuitBreaker = new CircuitBreaker({
    name: 'claude-api',
    failureThreshold: 3,
    recoveryTimeoutMs: 60_000,
})

function toContentPillar(raw: string): ContentPillar {
    const map: Record<string, ContentPillar> = {
        educational: ContentPillar.EDUCATIONAL,
        promotional: ContentPillar.PROMOTIONAL,
        lifestyle: ContentPillar.LIFESTYLE,
        engagement: ContentPillar.ENGAGEMENT,
        behind_the_scenes: ContentPillar.BEHIND_THE_SCENES,
    }
    return map[raw] ?? ContentPillar.LIFESTYLE
}

async function processGenerateContent(
    job: Job<GenerateContentPayload>
): Promise<void> {
    const startTime = Date.now()
    const { topic, productType, count } = job.data

    logger.info({ jobId: job.id, topic, productType, count }, 'Starting content generation job')

    // Buat agent session untuk tracking lifecycle job ini di DB
    // Setiap job punya session sendiri → bisa di-query untuk audit/debug
    const memory = await createAgentSession('content-orchestrator', job.id)

    try {
        for (let i = 0; i < count; i++) {
            await job.updateProgress(Math.round((i / count) * 90))

            // traceId menghubungkan BullMQ job ke Langfuse trace
            // Format: job-{jobId}-{index} — mudah dicari di dashboard
            const traceId = `job-${job.id}-${i}`

            // Circuit breaker membungkus orchestrator:
            // • Jika Claude API sedang down, CircuitOpenError dilempar
            // • Job tidak akan retry sia-sia, masuk dead-letter setelah max attempts
            const result = await claudeCircuitBreaker.execute(() =>
                runContentOrchestrator({ topic, productType }, traceId)
            )

            // Simpan ContentDraft ke DB dengan hasil dari orchestrator
            const draft = await contentDraftRepository.create({
                caption: result.caption,
                hashtags: result.hashtags,
                imagePrompt: result.imagePrompt,
                contentPillar: toContentPillar(result.contentPillar),
                bestPostTime: result.bestPostTime,
            })

            // Tandai agent session selesai — simpan draftId untuk traceability
            await memory.complete(draft.id)

            // Notifikasi pemilik bahwa ada draft baru yang perlu direview
            const reviewUrl = `http://localhost:${env.PORT}/review/drafts/${draft.id}`
            await telegram.notifyDraftReady({
                draftId: draft.id,
                caption: draft.caption,
                contentPillar: draft.contentPillar,
                reviewUrl,
            })

            logger.info(
                { jobId: job.id, index: i + 1, total: count, draftId: draft.id, durationMs: result.durationMs },
                'Content draft saved'
            )
        }

        await job.updateProgress(100)

        await jobLogRepository.create({
            jobName: 'generateContent',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: { topic, productType, count },
            result: { draftsCreated: count },
            duration: Date.now() - startTime,
        })

        logger.info({ jobId: job.id, count }, 'Content generation job completed')
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        // Tandai agent session gagal sebelum rethrow
        await memory.fail(message)

        await jobLogRepository.create({
            jobName: 'generateContent',
            jobId: job.id ?? 'unknown',
            status: 'failed',
            payload: { topic, productType, count },
            error: message,
            duration: Date.now() - startTime,
        })

        throw error
    }
}

export function createGenerateContentWorker(): Worker {
    const worker = new Worker<GenerateContentPayload>(
        'generateContent',
        processGenerateContent,
        {
            connection: redisConnection,
            concurrency: 1,
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'generateContent job completed')
    })

    worker.on('failed', (job, err) => {
        // CircuitOpenError bukan bug — ini sistem bekerja dengan benar
        const isCircuitOpen = err instanceof CircuitOpenError
        logger.error(
            { jobId: job?.id, err, circuitOpen: isCircuitOpen },
            isCircuitOpen
                ? 'generateContent job failed: Claude API circuit is OPEN — tunggu recovery'
                : 'generateContent job failed'
        )
    })

    return worker
}
