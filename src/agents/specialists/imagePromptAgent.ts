import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { env } from '../../config/env.js'
import type { ContentPlan } from './contentPlannerAgent.js'
import type { LangfuseParent } from '../../lib/langfuse.js'

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

export async function runImagePromptAgent(
    plan: ContentPlan,
    parent?: LangfuseParent | null
): Promise<ImagePromptOutput> {
    logger.info({ topic: plan.topic }, '🎨 Image Prompt Agent starting')

    const span = parent?.span({
        name: 'image-prompt-agent',
        input: { topic: plan.topic, contentPillar: plan.contentPillar },
    }) ?? null

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

    try {
        if (!env.USE_LOCAL_LLM) {
            const { output, usage } = await generateText({
                model: aiModel,
                output: Output.object({ schema: ImagePromptOutputSchema }),
                system: SYSTEM_PROMPT,
                prompt,
            })

            span?.generation({
                name: 'image-prompt-generation',
                model: env.CLAUDE_MODELS,
                input: { system: SYSTEM_PROMPT, prompt },
                output,
                usage: {
                    input: usage?.inputTokens ?? 0,
                    output: usage?.outputTokens ?? 0,
                },
            }).end()

            span?.end({ output })
            logger.info('🎨 Image Prompt Agent done')
            return output
        }

        const { text, usage } = await generateText({
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

        span?.generation({
            name: 'image-prompt-generation',
            model: env.OLLAMA_MODEL,
            input: { system: SYSTEM_PROMPT, prompt },
            output: result.data,
            usage: {
                input: usage?.inputTokens ?? 0,
                output: usage?.outputTokens ?? 0,
            },
        }).end()

        span?.end({ output: result.data })
        logger.info('🎨 Image Prompt Agent done')
        return result.data
    } catch (error) {
        span?.end({ output: { error: error instanceof Error ? error.message : 'unknown' } })
        throw error
    }
}
