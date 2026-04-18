import { z } from 'zod'
import {
    generate,
    CLAUDE_MODELS,
    appendMessage,
    type ConservationHistory,
} from '../lib/claudeClient.js'
import { logger } from '../lib/logger.js'
import { BRAND_VOICE_SYSTEM_PROMPT } from './prompts/brandVoice.js'
import { ContentOutputSchema, type ContentOutput } from './contentGenerator.js'

export interface RevisionSession {
    originalContent: string
    history: ConservationHistory
    revisionCount: number
}

const MAX_REVISIONS = 5

export function createRevisionSession(content: ContentOutput): RevisionSession {
    const initialHistory: ConservationHistory = {
        messages: [
            {
                role: 'user',
                content: 'Generate content Intagram untuk produk fashion kami.',
            },
            {
                role: 'assistant',
                content: JSON.stringify(content),
            },
        ],
    }

    return {
        originalContent: content,
        history: initialHistory,
        revisionCount: 0,
    }
}

export async function reviseContent(
    session: RevisionSession,
    feedback: string
): Promise<{ content: ContentOutput, session: RevisionSession }> {

    if (session.revisionCount >= MAX_REVISIONS) {
        throw new Error(`Maximum revisions (${MAX_REVISIONS}) reached`)
    }

    logger.info({
        feedback,
        revisionCount: session.revisionCount + 1,
    }, 'Revising content based on feedback')

    const revisionPrompt = `
Feedback dari brand owner: "${feedback}"

Revisi konten berdasarkan feedback tersebut.
Pertahankan elemen yang tidak dikritik.
Return ONLY valid JSON dengan struktur yang sama seperti sebelumnya.
    `.trim()

    const raw = await generate({
        system: BRAND_VOICE_SYSTEM_PROMPT,
        prompt: revisionPrompt,
        history: session.history,
        model: CLAUDE_MODELS.SONNET,
        temperature: 0.7,
        maxTokens: 1024,
    })

    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonStart = cleaned.indexOf('{')
    if (jsonStart === -1) throw new Error('No JSON in revision response')

    const parsed = JSON.parse(cleaned.slice(jsonStart))
    const result = ContentOutputSchema.safeParse(parsed)

    if (!result.success) {
        logger.error({ error: result.error.flatten() }, 'Invalid revision output')
        throw new Error('Revision failed: invalid output structure')
    }

    const updatedHistory = appendMessage(
        appendMessage(session.history, 'user', revisionPrompt),
        'assistant',
        raw
    )

    return {
        content: result.data,
        session: {
            ...session,
            history: updatedHistory,
            revisionCount: session.revisionCount + 1,
        },
    }
}
