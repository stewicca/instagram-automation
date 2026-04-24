import { z } from 'zod'
import { generate, CLAUDE_MODELS } from '../lib/claudeClient.js'
import { logger } from '../lib/logger.js'
import { BRAND_VOICE_SYSTEM_PROMPT } from './prompts/brandVoice.js'

export const ContentOutputSchema = z.object({
    caption: z.string().min(10).max(2200),
    hashtags: z.array(z.string().startsWith('#')).min(5).max(30),
    imagePrompt: z.string().min(20),
    bestPostingTime: z.string(),
    contentPillar: z.enum(['educational', 'promotional', 'lifestyle', 'behind_the_scenes']),
})

export type ContentOutput = z.infer<typeof ContentOutputSchema>

export interface ContentRequest {
    topic: string
    productType: string
    currentMoment?: string
}

function buildContentPrompt(request: ContentRequest): string {
    return `
				Buat konten Instagram untuk produk berikut:

				Topik: ${request.topic}
				Tipe produk: ${request.productType}
				${request.currentMoment ? `Momen/konteks: ${request.currentMoment}` : ''}

				Return ONLY a JSON object dengan struktur berikut (no explanation, no markdown):
				{
				    "caption": "teks caption, max 150 kata",
				    "hashtags": ["#hashtag1", "#hashtag2", ...],
				    "imagePrompt": "detailed prompt untuk AI image generation, dalam bahasa Inggris",
				    "bestPostingTime": "contoh: Selasa 19:00 WIB",
				    "contentPillar": "educational|promotional|lifestyle|behind_the_scenes"
				}

				Untuk hashtags: mix antara populer (#Fashion, #OOTD) dan niche (#BatikModern, #FashionLokal).
				Untuk imagePrompt: deskripsikan visual yang cinematic, spesifik soal komposisi, pencahayaan, dan mood.
		`.trim()
}

function parseJsonResponse(raw: string): unknown {
    const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

    const jsonStart = cleaned.indexOf('{')
    if (jsonStart === -1) throw new Error('No JSON object found in response')

    return JSON.parse(cleaned.slice(jsonStart))
}

export async function generateContent(request: ContentRequest): Promise<ContentOutput> {
    logger.info({ topic: request.topic, productType: request.productType }, 'Generating content')

    const raw = await generate({
        system: BRAND_VOICE_SYSTEM_PROMPT,
        prompt: buildContentPrompt(request),
        model: CLAUDE_MODELS.SONNET,
        temperature: 0.8,
        maxTokens: 1024,
    })

    const parsed = parseJsonResponse(raw)
    const result = ContentOutputSchema.safeParse(parsed)

    if (!result.success) {
        logger.error({
            error: result.error.flatten(),
            raw,
        }, 'LLM returned invalid content structure')
        throw new Error('Content generation failed: invalid output structure')
    }

    logger.info({ contentPillar: result.data.contentPillar }, 'Content generated successfully')
    return result.data
}
