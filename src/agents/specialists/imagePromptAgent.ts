import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { env } from '../../config/env.js'
import type { ContentPlan } from './contentPlannerAgent.js'

export const ImagePromptOutputSchema = z.object({
    imagePrompt: z.string().min(30).describe('Detailed prompt untuk AI image generation'),
    style: z.string().describe('Gaya visual: cinematic, editorial, lifestyle, dll'),
    colorPalette: z.array(z.string()).min(2).max(5).describe('Palet warna dominan'),
})

export type ImagePromptOutput = z.infer<typeof ImagePromptOutputSchema>

const SYSTEM_PROMPT = `
    Kamu adalah Art Director untuk "Nusantara Wear" — brand fashion lokal Indonesia.

    Aesthetic brand:
    - Minimalis modern dengan sentuhan budaya lokal
    - Warna earth tone: terracotta, sage green, cream, warm beige
    - Pencahayaan natural, soft shadows
    - Komposisi clean, tidak cluttered
    - Model terlihat confident, relatable (bukan model runway)

    Selalu tulis image prompt dalam bahasa Inggris yang detail dan spesifik.
`.trim()

export async function runImagePromptAgent(plan: ContentPlan): Promise<ImagePromptOutput> {
    logger.info({ topic: plan.topic }, '🎨 Image Prompt Agent starting')

    const prompt = `
        Buat detailed image prompt untuk konten Instagram ini:

        Topik: ${plan.topic}
        Emosi: ${plan.targetEmotion}
        Content Pillar: ${plan.contentPillar}
        Keywords: ${plan.keywords.join(', ')}

        Image prompt harus spesifik tentang:
        - Komposisi dan framing
        - Pencahayaan
        - Warna dan mood
        - Detail produk yang terlihat
        - Background dan setting
    `.trim()

    if (!env.USE_LOCAL_LLM) {
        const { output } = await generateText({
            model: aiModel,
            output: Output.object({ schema: ImagePromptOutputSchema }),
            system: SYSTEM_PROMPT,
            prompt,
        })
        logger.info('🎨 Image Prompt Agent done')
        return output
    }

    const { text } = await generateText({
        model: aiModel,
        system: SYSTEM_PROMPT,
        prompt: prompt + `

            Return ONLY valid JSON:
            {
                "imagePrompt": "detailed English prompt for AI image generation",
                "style": "gaya visual",
                "colorPalette": ["warna1", "warna2", "warna3"]
            }
        `,
    })

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonStart = cleaned.indexOf('{')
    if (jsonStart === -1) throw new Error('Image Prompt Agent: No JSON in response')

    const parsed = JSON.parse(cleaned.slice(jsonStart))
    const result = ImagePromptOutputSchema.safeParse(parsed)
    if (!result.success) throw new Error('Image Prompt Agent: Invalid output structure')

    logger.info('🎨 Image Prompt Agent done')
    return result.data
}
