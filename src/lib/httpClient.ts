import ky, { type Options, HTTPError } from 'ky'
import { logger } from './logger.js'
import { withRetry, type RetryOptions } from './retry.js'

const DEFAULT_OPTIONS: Options = {
    timeout: 30_300,
    retry: 0,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
}

export const httpClient = ky.create(DEFAULT_OPTIONS)

export async function fetchWithRetry<T>(
    url: string,
    options?: Options & RetryOptions
): Promise<T> {
    const { maxAttempts, baseDelayMs, shouldRetry, ...kyOptions } = options ?? {}

    return withRetry(
        async () => {
            try {
                const response = await httpClient(url, kyOptions).json<T>()
                return response
            } catch (error) {
                if (error instanceof HTTPError) {
                    const body = await error.response.text().catch(() => '')
                    logger.error({
                        status: error.response.status,
                        url,
                        body,
                    }, 'HTTP request failed')
                }
                throw error
            }
        },
        { maxAttempts, baseDelayMs, shouldRetry }
    )
}
