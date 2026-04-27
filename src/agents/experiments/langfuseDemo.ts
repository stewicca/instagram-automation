/**
 * Topik 8: Observability dengan Langfuse
 *
 * Jalankan: npx tsx src/agents/experiments/langfuseDemo.ts
 *
 * Yang kamu pelajari:
 * 1. Cara Langfuse melacak setiap langkah agent
 * 2. Hierarki trace → span → generation
 * 3. Cara baca timeline, token usage, dan latency di dashboard
 * 4. Mengapa observability penting: tanpanya kamu buta di production
 *
 * Prerequisite:
 *   1. Daftar di https://cloud.langfuse.com (gratis)
 *   2. Buat project → copy Public Key + Secret Key
 *   3. Tambahkan ke .env:
 *      LANGFUSE_PUBLIC_KEY=pk-lf-...
 *      LANGFUSE_SECRET_KEY=sk-lf-...
 */
import { runContentOrchestrator } from '../orchestrator.js'
import { langfuse, flushLangfuse } from '../../lib/langfuse.js'

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗')
    console.log('║  Topik 8: Observability dengan Langfuse           ║')
    console.log('╚══════════════════════════════════════════════════╝')

    if (!langfuse) {
        console.log(`
⚠️  Langfuse belum dikonfigurasi.

Untuk mengaktifkan tracing:
  1. Daftar gratis di https://cloud.langfuse.com
  2. Buat project baru
  3. Copy API keys ke .env:
     LANGFUSE_PUBLIC_KEY=pk-lf-...
     LANGFUSE_SECRET_KEY=sk-lf-...

Orchestrator tetap berjalan — tapi tanpa tracing.
`)
    } else {
        console.log('\n✅ Langfuse aktif — trace akan muncul di dashboard\n')
    }

    // traceId unik per run — ini yang kamu cari di Langfuse dashboard
    const traceId = `langfuse-demo-${Date.now()}`

    console.log(`Menjalankan Content Orchestrator...`)
    console.log(`Trace ID: ${traceId}\n`)

    const start = Date.now()

    const result = await runContentOrchestrator(
        {
            topic: 'batik modern untuk kerja',
            productType: 'kemeja batik slim fit',
        },
        traceId
    )

    const durationMs = Date.now() - start

    console.log('─────────────────────────────────────────────')
    console.log('✅ Orchestrator selesai!')
    console.log(`   Content Pillar : ${result.contentPillar}`)
    console.log(`   Best Post Time : ${result.bestPostTime}`)
    console.log(`   Duration       : ${durationMs}ms`)
    console.log(`   Caption (70ch) : ${result.caption.slice(0, 70)}...`)
    console.log(`   Hashtags (5)   : ${result.hashtags.slice(0, 5).join(' ')}`)
    console.log('─────────────────────────────────────────────')

    // Flush memastikan semua events terkirim ke Langfuse sebelum process exit
    await flushLangfuse()

    if (langfuse) {
        console.log(`
🔍 Buka Langfuse dashboard untuk melihat trace:
   https://cloud.langfuse.com

Cari trace dengan ID: ${traceId}

Yang bisa kamu lihat di dashboard:
  📊 Timeline:
     content-orchestrator
       └── content-planner-agent  (sequential)
             └── content-plan-generation (LLM call + tokens)
       └── caption-agent           (paralel)
             └── caption-generation (LLM call + tokens)
       └── image-prompt-agent      (paralel)
             └── image-prompt-generation (LLM call + tokens)

  💰 Token Usage per agent — lihat mana yang paling mahal
  ⏱️  Latency per step — identifikasi bottleneck
  📥 Input/output setiap LLM call — debug prompt issues

Mengapa ini penting di production:
  • Tanpa trace: kalau agent lambat/salah, kamu tidak tahu di step mana
  • Dengan trace: langsung lihat "content-planner took 4s, caption took 1s"
  • Cost monitoring: lihat total tokens per job → kalkulasi biaya
`)
    }
}

main().catch(err => {
    console.error('Demo error:', err)
    process.exit(1)
})
