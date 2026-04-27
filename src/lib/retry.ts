export interface RetryOptions {
    maxAttempts?: number
    baseDelayMs?: number
    timeoutMs?: number
    shouldRetry?: (error: unknown) => boolean
    // Dipanggil sebelum setiap retry — berguna untuk logging dan observability
    onRetry?: (attempt: number, error: unknown) => void
}

function isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase()
        return msg.includes('429') || msg.includes('503') || msg.includes('network')
    }
    return false
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    {
        maxAttempts = 3,
        baseDelayMs = 1000,
        shouldRetry = isRetryableError,
        onRetry,
    }: RetryOptions = {}
): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (attempt === maxAttempts || !shouldRetry(error)) throw error

            onRetry?.(attempt, error)

            const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    throw lastError
}
