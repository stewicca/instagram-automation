import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { env } from '../../config/env.js'
import type { ContentPlan } from './contentPlannerAgent.js'
import type { LangfuseParent } from '../../lib/langfuse.js'

export const CaptionOutputSchema = z.object({
    caption: z.string().min(10).max(2200),
    hashtags: z.array(z.string().startsWith('#')).min(5).max(30),
    callToAction: z.string().describe('CTA yang subtle, bukan sales-y'),
})

export type CaptionOutput = z.infer<typeof CaptionOutputSchema>

const SYSTEM_PROMPT = `
    Kamu adalah Copywriter senior untuk "Nusantara Wear" — brand fashion lokal Indonesia.

    Tone of voice:
    - Hangat dan personal, seperti teman yang stylish
    - Storytelling — setiap produk punya cerita pengrajin
    - Bahasa Indonesia yang natural, tidak kaku
    - Max 2 emoji per caption
    - Jangan sales-y, jangan klaim berlebihan

    Format caption: Hook kuat di kalimat pertama, lalu cerita, lalu CTA yang natural.
`.trim()

export async function runCaptionAgent(
    plan: ContentPlan,
    parent?: LangfuseParent | null
): Promise<CaptionOutput> {
    logger.info({ topic: plan.topic }, '✍️  Caption Agent starting')

    const span = parent?.span({
        name: 'caption-agent',
        input: { topic: plan.topic, contentPillar: plan.contentPillar },
    }) ?? null

    const prompt = `
        Tulis caption Instagram berdasarkan rencana konten ini:

        Topik: ${plan.topic}
        Angle: ${plan.angle}
        Emosi yang dibangkitkan: ${plan.targetEmotion}
        Content Pillar: ${plan.contentPillar}
        Keywords: ${plan.keywords.join(', ')}

        Caption harus:
        - Hook kuat di kalimat pertama
        - Ceritakan angle dengan natural
        - Hashtags mix populer dan niche
        - CTA yang subtle di akhir
    `.trim()

    try {
        if (!env.USE_LOCAL_LLM) {
            const { output, usage } = await generateText({
                model: aiModel,
                output: Output.object({ schema: CaptionOutputSchema }),
                system: SYSTEM_PROMPT,
                prompt,
            })

            span?.generation({
                name: 'caption-generation',
                model: env.CLAUDE_MODELS,
                input: { system: SYSTEM_PROMPT, prompt },
                output,
                usage: {
                    input: usage?.inputTokens ?? 0,
                    output: usage?.outputTokens ?? 0,
                },
            }).end()

            span?.end({ output: { captionPreview: output.caption.slice(0, 80), hashtagCount: output.hashtags.length } })
            logger.info('✍️  Caption Agent done')
            return output
        }

        const { text, usage } = await generateText({
            model: aiModel,
            system: SYSTEM_PROMPT,
            prompt: prompt + `

                Return ONLY valid JSON:
                {
                    "caption": "teks caption lengkap",
                    "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3", "#Hashtag4", "#Hashtag5"],
                    "callToAction": "teks CTA"
                }
            `,
        })

        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const jsonStart = cleaned.indexOf('{')
        if (jsonStart === -1) throw new Error('Caption Agent: No JSON in response')

        const parsed = JSON.parse(cleaned.slice(jsonStart))
        const result = CaptionOutputSchema.safeParse(parsed)
        if (!result.success) throw new Error('Caption Agent: Invalid output structure')

        span?.generation({
            name: 'caption-generation',
            model: env.OLLAMA_MODEL,
            input: { system: SYSTEM_PROMPT, prompt },
            output: result.data,
            usage: {
                input: usage?.inputTokens ?? 0,
                output: usage?.outputTokens ?? 0,
            },
        }).end()

        span?.end({ output: { captionPreview: result.data.caption.slice(0, 80) } })
        logger.info('✍️  Caption Agent done')
        return result.data
    } catch (error) {
        span?.end({ output: { error: error instanceof Error ? error.message : 'unknown' } })
        throw error
    }
}
