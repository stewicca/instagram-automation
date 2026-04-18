import Anthropic from '@anthropic-ai/sdk'
import { MessageParam } from '@anthropic-ai/sdk/dist/types'
import { env } from '../config/env.js'
import { logger } from './logger.js'
import { withRetry } from './retry.js'
import { trackUsage } from './costTracker.js'

export const anthropic = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
})

export const CLAUDE_MODELS = {
    OPUS: 'claude-opus-4-6',
    SONNET: 'claude-sonnet-4-6',
    HAIKU: 'claude-haiku-4-5-20251001',
} as const

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS]

export type ConservationMessage = MessageParam

export interface ConservationHistory {
    messages: ConservationMessage[]
}

interface GenerateOptions {
    system: string
    prompt: string
    history?: ConservationHistory
    model?: ClaudeModel
    temperature?: number
    maxTokens?: number
}

type StreamCallback = (chunk: string) => void

export function appendMessage(
    history: ConservationHistory,
    role: 'user' | 'assistant',
    content: string
): ConservationHistory {
    return {
        messages: [...history.messages, { role, content }],
    }
}

export async function generate(options: GenerateOptions): Promise<string> {
    const {
        system,
        prompt,
        history,
        model = CLAUDE_MODELS.SONNET,
        temperature = 0.7,
        maxTokens = 1024,
    } = options

    logger.debug({ model, temperature }, 'Calling Claude API')

    const messages: ConservationMessage[] = [
        ...(history?.messages ?? []),
        { role: 'user', content: prompt }
    ]

    const response = await withRetry(
        () => anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            temperature,
            system,
            messages,
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

    trackUsage({
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
    })

    return content.text
}

export async function generateStream(
    options: Omit<GenerateOptions, 'history'>,
    onChunk: StreamCallback
): Promise<string> {
    const {
        system,
        prompt,
        model = CLAUDE_MODELS.SONNET,
        temperature = 0.7,
        maxToken = 1024,
    } = options

    let fullText = ''

    const stream = anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: prompt }],
    })

    stream.on('text', (chunk) => {
        fullText += chunk
        onChunk(chunk)
    })

    await stream.finalMessage()

    return fullText
}
