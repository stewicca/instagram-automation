/**
 * Langfuse Observability Client
 *
 * Langfuse adalah platform untuk trace dan monitor AI agents.
 * Setiap kali agent berjalan, kamu bisa lihat:
 *   - Timeline setiap langkah (content planner → caption → image prompt)
 *   - Token usage dan cost per langkah
 *   - Input/output setiap LLM call
 *   - Latency per agent
 *
 * Jika LANGFUSE_PUBLIC_KEY dan LANGFUSE_SECRET_KEY tidak di-set,
 * langfuse = null dan semua tracing di-skip secara otomatis (no-op).
 */
import Langfuse from 'langfuse'
import { env } from '../config/env.js'
import { logger } from './logger.js'

// Derive types dari instance methods — lebih robust dari import named types
type _LangfuseInstance = InstanceType<typeof Langfuse>
export type LangfuseTrace = ReturnType<_LangfuseInstance['trace']>
export type LangfuseSpan = ReturnType<LangfuseTrace['span']>
export type LangfuseGeneration = ReturnType<LangfuseSpan['generation']>

// LangfuseParent = apapun yang bisa membuat child observation (trace atau span)
export type LangfuseParent = LangfuseTrace | LangfuseSpan

const isConfigured = Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY)

export const langfuse: _LangfuseInstance | null = isConfigured
    ? new Langfuse({
          publicKey: env.LANGFUSE_PUBLIC_KEY!,
          secretKey: env.LANGFUSE_SECRET_KEY!,
          baseUrl: env.LANGFUSE_BASE_URL,
          // flushAt=1 untuk development — kirim langsung setiap event
          // Production: naikkan ke 15-20 untuk batching
          flushAt: 1,
      })
    : null

if (langfuse) {
    logger.info({ baseUrl: env.LANGFUSE_BASE_URL }, '🔍 Langfuse observability enabled')
} else {
    logger.debug('🔍 Langfuse not configured — tracing disabled (set LANGFUSE_PUBLIC_KEY + SECRET_KEY)')
}

/**
 * Pastikan semua events terkirim ke Langfuse sebelum process exit.
 * Panggil ini di graceful shutdown dan di akhir demo scripts.
 */
export async function flushLangfuse(): Promise<void> {
    if (langfuse) {
        await langfuse.flushAsync()
        logger.debug('🔍 Langfuse flushed')
    }
}
