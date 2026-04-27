/**
 * Circuit Breaker Pattern
 *
 * Mencegah cascade failure ketika external service (Claude API, dll) sedang down.
 * Tanpa circuit breaker: setiap request tetap dikirim → semua gagal → cost & latency sia-sia.
 * Dengan circuit breaker: setelah N failures, panggilan diblokir sampai service pulih.
 *
 * State machine:
 *
 *   CLOSED ──(N failures)──→ OPEN ──(timeout elapsed)──→ HALF_OPEN
 *     ↑                                                        │
 *     └─────────────────(probe success)──────────────────────┘
 *                              │
 *                    (probe fails → OPEN lagi)
 */
import { logger } from './logger.js'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export class CircuitOpenError extends Error {
    constructor(name: string, remainingMs: number) {
        const seconds = Math.ceil(remainingMs / 1000)
        super(`Circuit "${name}" is OPEN — coba lagi dalam ${seconds} detik`)
        this.name = 'CircuitOpenError'
    }
}

export interface CircuitBreakerOptions {
    name: string
    // Berapa failures berturut-turut sebelum circuit OPEN (default: 5)
    failureThreshold?: number
    // Berapa ms sebelum mencoba probe ke HALF_OPEN (default: 30_000)
    recoveryTimeoutMs?: number
}

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED'
    private failures = 0
    private openedAt = 0

    private readonly failureThreshold: number
    private readonly recoveryTimeoutMs: number

    constructor(private readonly opts: CircuitBreakerOptions) {
        this.failureThreshold = opts.failureThreshold ?? 5
        this.recoveryTimeoutMs = opts.recoveryTimeoutMs ?? 30_000
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            const elapsed = Date.now() - this.openedAt
            const remaining = this.recoveryTimeoutMs - elapsed

            if (remaining > 0) {
                // Belum waktunya probe — langsung reject tanpa memanggil fn()
                throw new CircuitOpenError(this.opts.name, remaining)
            }

            // Timeout sudah lewat → probe dengan HALF_OPEN
            this.transition('HALF_OPEN')
        }

        try {
            const result = await fn()
            this.recordSuccess()
            return result
        } catch (error) {
            this.recordFailure()
            throw error
        }
    }

    getState(): CircuitState {
        return this.state
    }

    getFailures(): number {
        return this.failures
    }

    // Paksa reset ke CLOSED — berguna untuk testing atau manual recovery
    reset(): void {
        this.failures = 0
        this.openedAt = 0
        this.transition('CLOSED')
    }

    private recordSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            // Probe berhasil → pulih ke CLOSED
            this.transition('CLOSED')
        }
        this.failures = 0
    }

    private recordFailure(): void {
        this.failures++

        if (this.state === 'HALF_OPEN') {
            // Probe gagal → kembali OPEN, mulai ulang timer
            this.transition('OPEN')
            return
        }

        if (this.failures >= this.failureThreshold) {
            this.transition('OPEN')
        }
    }

    private transition(next: CircuitState): void {
        const prev = this.state
        if (prev === next) return

        this.state = next

        if (next === 'OPEN') {
            this.openedAt = Date.now()
        }

        logger.warn(
            {
                circuit: this.opts.name,
                from: prev,
                to: next,
                failures: this.failures,
                recoveryTimeoutMs: next === 'OPEN' ? this.recoveryTimeoutMs : undefined,
            },
            `⚡ Circuit breaker [${this.opts.name}]: ${prev} → ${next}`
        )
    }
}
