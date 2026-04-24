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

    logger.info('☁️  Using Claude (Anthropic) model')
    return anthropic('claude-sonnet-4-5')
}

export const aiModel = createModel()
