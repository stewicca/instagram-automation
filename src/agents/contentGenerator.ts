import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiModel } from '../config/aiModel.js'
import { logger } from '../lib/logger.js'
import { BRAND_VOICE_SYSTEM_PROMPT } from './prompts/brandVoice.js'
import { env } from '../config/env.js'

export const ContentOutputSchema = z.object({
    caption: z.string().min(10).max(2200),
    hashtags: z.array(z.string().startsWith('#')).min(5).max(30),
    imagePrompt: z.string().min(20),
    bestPostingTime: z.string(),
    contentPillar: z.enum([
        'educational',
        'promotional',
        'lifestyle',
        'behind_the_scenes',
    ]),
})

export type ContentOutput = z.infer<typeof ContentOutputSchema>

export interface ContentRequest {
    topic: string
    productType: string
    currentMoment?: string
}

function buildPrompt(request: ContentRequest): string {
    return `
        Buat konten Instagram untuk produk berikut:
        Topik: ${request.topic}
        Tipe produk: ${request.productType}
        ${request.currentMoment ? `Momen/konteks: ${request.currentMoment}` : ''}

        Untuk hashtags: mix antara populer (#Fashion, #OOTD) dan niche (#BatikModern, #FashionLokal).
        Untuk imagePrompt: deskripsikan visual yang cinematic, spesifik soal komposisi,
        pencahayaan, dan mood. Tulis dalam bahasa Inggris.
    `.trim()
}

function parseJsonFromText(text: string): unknown {
    const cleaned = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
    const jsonStart = cleaned.indexOf('{')
    if (jsonStart === -1) throw new Error('No JSON object found in response')
    return JSON.parse(cleaned.slice(jsonStart))
}

export async function generateContent(
    request: ContentRequest
): Promise<ContentOutput> {
    logger.info(
        { topic: request.topic, productType: request.productType },
        'Generating content'
    )

    if (!env.USE_LOCAL_LLM) {
        const { output } = await generateText({
            model: aiModel,
            output: Output.object({ schema: ContentOutputSchema }),
            system: BRAND_VOICE_SYSTEM_PROMPT,
            prompt: buildPrompt(request),
        })

        logger.info(
            { contentPillar: output.contentPillar },
            'Content generated successfully'
        )

        return output
    }

    logger.info('Using manual parse path for local LLM')

    const { text } = await generateText({
        model: aiModel,
        system: BRAND_VOICE_SYSTEM_PROMPT,
        prompt: buildPrompt(request) + `

        		Return ONLY a valid JSON object dengan struktur berikut, tanpa penjelasan apapun:
            {
                "caption": "teks caption max 150 kata",
                "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
                "imagePrompt": "detailed image generation prompt in English",
                "bestPostingTime": "contoh: Selasa 19:00 WIB",
                "contentPillar": "lifestyle"
            }
        `,
    })

    const parsed = parseJsonFromText(text)
    const result = ContentOutputSchema.safeParse(parsed)

    if (!result.success) {
        logger.error(
            { error: result.error.flatten(), text },
            'LLM returned invalid content structure'
        )
        throw new Error('Content generation failed: invalid output structure')
    }

    logger.info(
        { contentPillar: result.data.contentPillar },
        'Content generated successfully'
    )

    return result.data
}
