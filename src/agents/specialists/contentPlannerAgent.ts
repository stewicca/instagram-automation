import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { env } from '../../config/env.js'
import type { LangfuseParent } from '../../lib/langfuse.js'

const CONTENT_PILLAR_ALIASES: Record<string, ContentPlan['contentPillar']> = {
    educational: 'educational',
    edukasi: 'educational',
    education: 'educational',
    promotional: 'promotional',
    promotion: 'promotional',
    promosi: 'promotional',
    promo: 'promotional',
    lifestyle: 'lifestyle',
    gaya_hidup: 'lifestyle',
    behind_the_scenes: 'behind_the_scenes',
    behindthescenes: 'behind_the_scenes',
    bts: 'behind_the_scenes',
    di_balik_layar: 'behind_the_scenes',
}

export const ContentPlanSchema = z.object({
    topic: z.string().describe('Topik spesifik konten'),
    angle: z.string().describe('Sudut pandang unik yang membedakan dari konten biasa'),
    targetEmotion: z.string().describe('Emosi yang ingin dibangkitkan pada audience'),
    contentPillar: z.enum([
        'educational',
        'promotional',
        'lifestyle',
        'behind_the_scenes',
    ]),
    suggestedPostTime: z.string().describe('Waktu optimal posting, contoh: Selasa 19:00 WIB'),
    keywords: z.array(z.string()).min(3).max(8),
})

export type ContentPlan = z.infer<typeof ContentPlanSchema>

function parseJsonObjectFromText(text: string): unknown {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
        throw new Error('Content Planner: No JSON in response')
    }

    return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1))
}

function normalizeContentPillar(value: unknown): ContentPlan['contentPillar'] | unknown {
    if (typeof value !== 'string') return value

    const firstCandidate = value.split(/[,/|]/)[0] ?? value
    const normalized = firstCandidate
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')

    const aliased = CONTENT_PILLAR_ALIASES[normalized]
    if (aliased) return aliased

    if (normalized.includes('lifestyle')) return 'lifestyle'
    if (normalized.includes('promo') || normalized.includes('promot')) return 'promotional'
    if (normalized.includes('educat') || normalized.includes('eduka')) return 'educational'
    if (normalized.includes('behind') || normalized.includes('balik') || normalized.includes('bts')) {
        return 'behind_the_scenes'
    }

    return value
}

function normalizeKeywords(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value
            .map((keyword) => (typeof keyword === 'string' ? keyword.trim() : keyword))
            .filter((keyword): keyword is string => typeof keyword === 'string' && keyword.length > 0)
    }

    if (typeof value === 'string') {
        return value
            .split(/[,\n]/)
            .map((keyword) => keyword.trim())
            .filter((keyword) => keyword.length > 0)
    }

    return value
}

function normalizePlanOutput(parsed: unknown): unknown {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed

    const obj = parsed as Record<string, unknown>
    return {
        topic: obj.topic,
        angle: obj.angle,
        targetEmotion: obj.targetEmotion ?? obj.target_emotion,
        contentPillar: normalizeContentPillar(
            obj.contentPillar ?? obj.content_pillar ?? obj.pilarKonten
        ),
        suggestedPostTime:
            obj.suggestedPostTime ?? obj.suggested_post_time ?? obj.bestPostingTime ?? obj.bestPostTime,
        keywords: normalizeKeywords(obj.keywords),
    }
}

const SYSTEM_PROMPT = `
    Kamu adalah Content Strategist senior untuk "Nusantara Wear" — brand fashion lokal Indonesia.

    Tugasmu adalah merencanakan SATU konten Instagram yang strategis.
    Fokus pada: relevansi tren, keunikan angle, dan potensi engagement tinggi.

    Brand values: autentik, bangga lokal, sustainable fashion.
    Target audience: profesional urban Indonesia, 25-38 tahun.
`.trim()

export async function runContentPlannerAgent(
    request: {
        topic: string
        productType: string
        currentMoment?: string
    },
    // Parent Langfuse observation — diisi dari orchestrator, null jika Langfuse tidak aktif
    parent?: LangfuseParent | null
): Promise<ContentPlan> {
    logger.info({ topic: request.topic }, '🗓️  Content Planner Agent starting')

    // Buat span di bawah parent trace/span untuk melacak agent ini di Langfuse
    const span = parent?.span({
        name: 'content-planner-agent',
        input: request,
    }) ?? null

    const prompt = `
        Rencanakan strategi konten Instagram untuk:
        - Topik: ${request.topic}
        - Produk: ${request.productType}
        ${request.currentMoment ? `- Konteks: ${request.currentMoment}` : ''}

        Buat rencana yang spesifik dan actionable.
    `.trim()

    try {
        if (!env.USE_LOCAL_LLM) {
            const { output, usage } = await generateText({
                model: aiModel,
                output: Output.object({ schema: ContentPlanSchema }),
                system: SYSTEM_PROMPT,
                prompt,
            })

            // Catat LLM call di Langfuse: model, tokens, input/output
            span?.generation({
                name: 'content-plan-generation',
                model: env.CLAUDE_MODELS,
                input: { system: SYSTEM_PROMPT, prompt },
                output,
                usage: {
                    input: usage?.inputTokens ?? 0,
                    output: usage?.outputTokens ?? 0,
                },
            }).end()

            span?.end({ output })
            logger.info({ contentPillar: output.contentPillar }, '🗓️  Content Planner Agent done')
            return output
        }

        const { text, usage } = await generateText({
            model: aiModel,
            system: SYSTEM_PROMPT,
            prompt: prompt + `

            		Return ONLY valid JSON:
                {
                    "topic": "topik spesifik",
                    "angle": "sudut pandang unik",
                    "targetEmotion": "emosi yang dibangkitkan",
                    "contentPillar": "lifestyle",
                    "suggestedPostTime": "Selasa 19:00 WIB",
                    "keywords": ["kata1", "kata2", "kata3"]
                }
            `,
        })

        const parsed = parseJsonObjectFromText(text)
        const normalized = normalizePlanOutput(parsed)
        const result = ContentPlanSchema.safeParse(normalized)
        if (!result.success) {
            logger.error(
                { error: result.error.flatten(), responseText: text },
                'Content Planner returned invalid output structure'
            )
            throw new Error('Content Planner: Invalid output structure')
        }

        span?.generation({
            name: 'content-plan-generation',
            model: env.OLLAMA_MODEL,
            input: { system: SYSTEM_PROMPT, prompt },
            output: result.data,
            usage: {
                input: usage?.inputTokens ?? 0,
                output: usage?.outputTokens ?? 0,
            },
        }).end()

        span?.end({ output: result.data })
        logger.info({ contentPillar: result.data.contentPillar }, '🗓️  Content Planner Agent done')
        return result.data
    } catch (error) {
        span?.end({ output: { error: error instanceof Error ? error.message : 'unknown' } })
        throw error
    }
}
