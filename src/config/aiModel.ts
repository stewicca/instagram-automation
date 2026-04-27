import { createOllama } from 'ai-sdk-ollama'
import { anthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import { env } from './env.js'
import { logger } from '../lib/logger.js'

function createModel(): LanguageModel {
    if (env.USE_LOCAL_LLM) {
        logger.info(
            { model: env.OLLAMA_MODEL, baseUrl: env.OLLAMA_BASE_URL },
            '🦙 Using Ollama (local) model via ai-sdk-ollama'
        )

        const ollama = createOllama({
            baseURL: env.OLLAMA_BASE_URL,
        })

        return ollama(env.OLLAMA_MODEL)
    }

    logger.info({ model: env.CLAUDE_MODELS }, '☁️  Using Claude (Anthropic) model')
    return anthropic(env.CLAUDE_MODELS)
}

export const aiModel = createModel()

/**
 * Mengembalikan model fallback ketika model utama rate-limited.
 * Fallback chain: Sonnet → Haiku → null (tidak ada fallback lagi)
 */
export function getFallbackModel(): LanguageModel | null {
    if (env.USE_LOCAL_LLM) return null

    if (env.CLAUDE_MODELS === 'claude-sonnet-4-6') {
        logger.warn('⚠️  Model fallback: Sonnet → Haiku')
        return anthropic('claude-haiku-4-5-20251001')
    }

    // Sudah di Haiku (model terkecil) — tidak ada fallback lagi
    return null
}

function isRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const msg = error.message.toLowerCase()
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('rate_limit')
}

/**
 * Menjalankan fn dengan model utama.
 * Jika rate-limited (429), otomatis coba ulang dengan model fallback.
 *
 * Contoh penggunaan:
 *   const result = await withModelFallback(model => generateText({ model, prompt }))
 */
export async function withModelFallback<T>(
    fn: (model: LanguageModel) => Promise<T>
): Promise<T> {
    try {
        return await fn(aiModel)
    } catch (error) {
        const fallback = getFallbackModel()

        if (!fallback || !isRateLimitError(error)) throw error

        logger.warn(
            { originalError: error instanceof Error ? error.message : error },
            '⚠️  Primary model rate-limited — falling back to Haiku'
        )

        return await fn(fallback)
    }
}
