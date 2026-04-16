import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env.js'
import { logger } from './logger.js'
import { withRetry } from './retry.js'

export const anthropic = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODELS = {
    OPUS: 'claude-opus-4-6',
    SONNET: 'claude-sonnet-4-6',
    HAIKU: 'claude-haiku-4-5-20251001',
} as const

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS]

interface GenerateOptions {
    system: string
    prompt: string
    model?: ClaudeModel
    temperature?: number
    maxTokens?: number
}

export async function generate(options: GenerateOptions): Promise<string> {
    const {
        system,
        prompt,
        model = CLAUDE_MODELS.SONNET,
        temperature = 0.7,
        maxTokens = 1024,
    } = options

    logger.debug({ model, temperature }, 'Calling Claude API')

    const response = await withRetry(
        () => anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            temperature,
            system,
            messages: [
                { role: 'user', content: prompt }
            ],
        }),
        { maxAttempts: 3, baseDelayMs: 2000 }
    )

    const content = response.content[0]
    if (content === undefined) {
        throw new Error('Claude returned empty response')
    }
    if (content.type !== 'text') {
        throw new Error(`Unexpected response type: ${content.type}`)
    }

    logger.debug({
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    }, 'Claude API response received')

    return content.text
}
