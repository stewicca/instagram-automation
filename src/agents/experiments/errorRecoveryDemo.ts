/**
 * Topik 7: Error Recovery Demo
 *
 * Jalankan: npx tsx src/agents/experiments/errorRecoveryDemo.ts
 *
 * Yang kamu pelajari:
 * 1. Circuit Breaker — state machine CLOSED → OPEN → HALF_OPEN → CLOSED
 * 2. onRetry callback — visibilitas setiap retry attempt
 * 3. Model Fallback — Sonnet → Haiku ketika rate-limited
 * 4. Kombinasi retry + circuit breaker untuk sistem yang resilient
 */
import { CircuitBreaker, CircuitOpenError } from '../../lib/circuitBreaker.js'
import { withRetry } from '../../lib/retry.js'
import { getFallbackModel } from '../../config/aiModel.js'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

// ─────────────────────────────────────────────────────────────────────────────
// Demo 1: Circuit Breaker — state machine
// ─────────────────────────────────────────────────────────────────────────────

async function demo1CircuitBreaker(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 1: Circuit Breaker — State Machine')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const circuit = new CircuitBreaker({
        name: 'claude-api',
        failureThreshold: 3,    // buka setelah 3 kegagalan
        recoveryTimeoutMs: 2000, // coba probe setelah 2 detik (lebih pendek untuk demo)
    })

    const alwaysFails = (): Promise<string> =>
        Promise.reject(new Error('503 Service Unavailable'))

    const alwaysSucceeds = (): Promise<string> =>
        Promise.resolve('✅ OK')

    console.log(`\nState awal: ${circuit.getState()} (setiap call lewat)`)

    // 3 failures → circuit OPEN
    for (let i = 1; i <= 3; i++) {
        try {
            await circuit.execute(alwaysFails)
        } catch (err) {
            console.log(
                `  Failure ${i}/3: "${(err as Error).message}" → state: ${circuit.getState()}`
            )
        }
    }

    // Circuit OPEN — call berikutnya diblokir tanpa menyentuh API
    console.log(`\n⚡ Circuit OPEN! Mencoba call ke-4...`)
    try {
        await circuit.execute(alwaysFails)
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.log(`  CircuitOpenError: ${err.message}`)
            console.log('  → API tidak dipanggil sama sekali (cost & latency diselamatkan)')
        }
    }

    // Tunggu recovery timeout
    console.log(`\n⏳ Menunggu recovery timeout (2 detik)...`)
    await new Promise(r => setTimeout(r, 2100))

    // Probe call pertama → HALF_OPEN → jika berhasil kembali ke CLOSED
    console.log('🔍 Probe call setelah timeout (HALF_OPEN)...')
    try {
        const result = await circuit.execute(alwaysSucceeds)
        console.log(`  Probe berhasil! Result: ${result}`)
        console.log(`  State sekarang: ${circuit.getState()} (kembali normal)`)
    } catch (err) {
        console.log(`  Probe gagal — circuit kembali OPEN`)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 2: Retry dengan onRetry callback
// ─────────────────────────────────────────────────────────────────────────────

async function demo2RetryWithCallback(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 2: Retry dengan onRetry Callback')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    let callCount = 0

    // Simulasi API yang flaky: gagal 2x, berhasil di ke-3
    const flakeyApi = async (): Promise<string> => {
        callCount++
        if (callCount < 3) {
            throw new Error('429 Too Many Requests')
        }
        return `Content generated! (berhasil di attempt ke-${callCount})`
    }

    console.log('\nMemanggil flaky API (akan gagal 2x sebelum berhasil)...')

    const result = await withRetry(flakeyApi, {
        maxAttempts: 4,
        baseDelayMs: 100, // pendek untuk demo
        onRetry: (attempt, error) => {
            console.log(
                `  ↻ Retry #${attempt} — Error: "${(error as Error).message}" | Delay: ${100 * Math.pow(2, attempt - 1)}ms`
            )
        },
    })

    console.log(`\n✅ Berhasil: ${result}`)
    console.log('   (tanpa onRetry, kamu tidak tahu berapa kali retry terjadi)')
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 3: Model Fallback — Sonnet → Haiku
// ─────────────────────────────────────────────────────────────────────────────

async function demo3ModelFallback(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 3: Model Fallback — Sonnet → Haiku')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log(`\nPrimary model: ${env.USE_LOCAL_LLM ? env.OLLAMA_MODEL : env.CLAUDE_MODELS}`)

    const fallback = getFallbackModel()
    if (fallback) {
        console.log(`Fallback model: claude-haiku-4-5-20251001`)
        console.log('\nKapan fallback dipakai:')
        console.log('  • Sonnet rate-limited (429) → Haiku lebih murah, quota terpisah')
        console.log('  • Haiku: ~20x lebih murah dari Sonnet, cukup untuk konten sederhana')
        console.log('  • Trade-off: kualitas sedikit lebih rendah, tapi sistem tetap jalan')
    } else {
        console.log('Fallback: tidak tersedia (USE_LOCAL_LLM=true atau sudah di Haiku)')
    }

    // Simulasi rate limit error → fallback
    console.log('\nSimulasi: primary model kena rate limit...')
    let modelUsed = 'primary'

    const simulateWithFallback = async (): Promise<string> => {
        // Pertama coba primary (simulasi gagal 429)
        try {
            throw new Error('Error 429: rate_limit_exceeded')
        } catch (error) {
            const fb = getFallbackModel()
            if (!fb || !(error instanceof Error && error.message.includes('429'))) throw error
            modelUsed = 'fallback (Haiku)'
            logger.warn('Using fallback model due to rate limit')
            return `Content generated with ${modelUsed}`
        }
    }

    const result = await simulateWithFallback()
    console.log(`✅ ${result}`)
    console.log('   (production: Haiku auto-generate, user tidak sadar ada masalah)')
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 4: Retry + Circuit Breaker dikombinasikan
// ─────────────────────────────────────────────────────────────────────────────

async function demo4Combined(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 4: Kombinasi Retry + Circuit Breaker')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\nPattern: retry untuk transient errors, circuit breaker untuk systematic failures')
    console.log('Setiap circuit.execute() = 1 "attempt" dengan maxAttempts retry di dalamnya')

    const circuit = new CircuitBreaker({
        name: 'image-api',
        failureThreshold: 2, // buka setelah 2 circuit-level failures
        recoveryTimeoutMs: 1500,
    })

    let globalAttempt = 0

    const unstableApi = async (): Promise<string> => {
        globalAttempt++
        if (globalAttempt <= 5) throw new Error('503 Service Unavailable')
        return '🖼️  Image generated!'
    }

    // Setiap panggilan circuit.execute() membungkus withRetry
    const callWithProtection = (callNum: number) =>
        circuit.execute(() =>
            withRetry(unstableApi, {
                maxAttempts: 2,
                baseDelayMs: 50,
                onRetry: (attempt, err) =>
                    console.log(`    ↻ [call ${callNum}] retry #${attempt}: ${(err as Error).message}`),
            })
        )

    for (let i = 1; i <= 5; i++) {
        try {
            const result = await callWithProtection(i)
            console.log(`\nCall ${i}: ✅ ${result} | circuit: ${circuit.getState()}`)
        } catch (err) {
            const label = err instanceof CircuitOpenError ? '⚡ Circuit OPEN' : '✗ Failed'
            console.log(`\nCall ${i}: ${label}: ${(err as Error).message} | circuit: ${circuit.getState()}`)
        }
        await new Promise(r => setTimeout(r, 300))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗')
    console.log('║  Topik 7: Error Recovery — Circuit Breaker Demo  ║')
    console.log('╚══════════════════════════════════════════════════╝')

    await demo1CircuitBreaker()
    await demo2RetryWithCallback()
    await demo3ModelFallback()
    await demo4Combined()

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Semua demo selesai!')
    console.log('\nKey Takeaways:')
    console.log('  1. Circuit Breaker mencegah cascade failure — blokir calls ketika service down')
    console.log('  2. onRetry callback memberi visibilitas tanpa mengubah logic retry')
    console.log('  3. Model fallback: degradasi kualitas tapi sistem tetap berjalan')
    console.log('  4. Kombinasikan: retry (transient) + circuit breaker (systematic)')
    console.log('\nProduction tip: gunakan recoveryTimeoutMs 30-60 detik untuk Claude API')
}

main().catch(err => {
    console.error('Demo error:', err)
    process.exit(1)
})
