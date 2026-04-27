/**
 * Fase 7: Ads Analyst Agent
 *
 * LLM-powered agent untuk menganalisis performa campaign Meta Ads dan
 * memberikan rekomendasi tindakan yang konkret.
 *
 * Input : CampaignPerformance + PostAnalytics (context)
 * Output: AdsRecommendation (action + reasoning + suggested budget)
 */
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { env } from '../../config/env.js'
import type { CampaignPerformance } from '../../instagram/adsClient.js'
import type { LangfuseParent } from '../../lib/langfuse.js'

export const AdsRecommendationSchema = z.object({
    action: z.enum(['SCALE', 'CONTINUE', 'ADJUST_BUDGET', 'PAUSE', 'BOOST_NEW']),
    reasoning: z.string().describe('Penjelasan singkat mengapa action ini'),
    suggestedDailyBudgetIdr: z.number().optional().describe('Budget baru jika action = SCALE atau ADJUST_BUDGET'),
    urgency: z.enum(['high', 'medium', 'low']),
    summary: z.string().describe('Satu kalimat ringkasan untuk notifikasi Telegram'),
})

export type AdsRecommendation = z.infer<typeof AdsRecommendationSchema>

export interface AdsAnalystInput {
    postEngagementRate: number
    postReach: number
    campaign?: CampaignPerformance
    currentDailyBudgetIdr?: number
}

const SYSTEM_PROMPT = `
    Kamu adalah Digital Marketing Analyst spesialis Meta Ads untuk fashion brand Indonesia.

    Tugas: analisis data performa dan berikan rekomendasi tindakan yang jelas dan actionable.

    Panduan keputusan:
    - SCALE: CPM rendah (<Rp 5.000) + ROAS bagus + engagement organik tinggi → naikkan budget 50%
    - CONTINUE: Performa normal, tidak ada sinyal kuat untuk ubah sesuatu
    - ADJUST_BUDGET: Spend terlalu tinggi vs reach, atau budget kurang digunakan — sesuaikan angka
    - PAUSE: CPM terlalu tinggi (>Rp 15.000) atau engagement <0.5% → stop, evaluasi creative
    - BOOST_NEW: Post organik baru dengan engagement >3% tapi belum di-boost → rekomendasikan boost

    Konteks brand: fashion lokal Indonesia, akun baru (<6 bulan), target utama awareness.
    Budget standar: Rp 50.000–100.000/hari untuk post boost awal.
`.trim()

export async function runAdsAnalystAgent(
    input: AdsAnalystInput,
    parent?: LangfuseParent | null
): Promise<AdsRecommendation> {
    logger.info({ input }, '📊 Ads Analyst Agent starting')

    const span = parent?.span({
        name: 'ads-analyst-agent',
        input,
    }) ?? null

    const hasCampaign = Boolean(input.campaign)

    const prompt = hasCampaign ? `
        Analisis performa campaign Meta Ads ini:

        POST ORGANIK:
        - Engagement Rate: ${input.postEngagementRate.toFixed(2)}%
        - Reach Organik: ${input.postReach.toLocaleString()} orang

        CAMPAIGN ADS (${input.campaign!.campaignName}):
        - Spend: Rp ${input.campaign!.spend.toLocaleString()}
        - Impressions: ${input.campaign!.impressions.toLocaleString()}
        - Reach: ${input.campaign!.reach.toLocaleString()}
        - Clicks: ${input.campaign!.clicks.toLocaleString()}
        - CPM: Rp ${input.campaign!.cpm.toLocaleString()}
        - CTR: ${input.campaign!.ctr.toFixed(2)}%
        - Budget harian saat ini: Rp ${(input.currentDailyBudgetIdr ?? 50000).toLocaleString()}

        Berikan rekomendasi action yang paling tepat.
    `.trim() : `
        Post organik ini belum pernah di-boost:

        - Engagement Rate: ${input.postEngagementRate.toFixed(2)}%
        - Reach Organik: ${input.postReach.toLocaleString()} orang

        Apakah layak untuk di-boost dengan Meta Ads?
        Jika ya, action = BOOST_NEW dan rekomendasikan budget harian.
    `.trim()

    try {
        if (!env.USE_LOCAL_LLM) {
            const { output, usage } = await generateText({
                model: aiModel,
                output: Output.object({ schema: AdsRecommendationSchema }),
                system: SYSTEM_PROMPT,
                prompt,
            })

            span?.generation({
                name: 'ads-analysis',
                model: env.CLAUDE_MODELS,
                input: { system: SYSTEM_PROMPT, prompt },
                output,
                usage: {
                    input: usage?.inputTokens ?? 0,
                    output: usage?.outputTokens ?? 0,
                },
            }).end()

            span?.end({ output: { action: output.action, urgency: output.urgency } })
            logger.info({ action: output.action, urgency: output.urgency }, '📊 Ads Analyst Agent done')
            return output
        }

        const { text, usage } = await generateText({
            model: aiModel,
            system: SYSTEM_PROMPT,
            prompt: prompt + `

                Return ONLY valid JSON:
                {
                    "action": "SCALE|CONTINUE|ADJUST_BUDGET|PAUSE|BOOST_NEW",
                    "reasoning": "alasan singkat",
                    "suggestedDailyBudgetIdr": 75000,
                    "urgency": "high|medium|low",
                    "summary": "satu kalimat ringkasan"
                }
            `,
        })

        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const jsonStart = cleaned.indexOf('{')
        if (jsonStart === -1) throw new Error('Ads Analyst: No JSON in response')

        const parsed = JSON.parse(cleaned.slice(jsonStart))
        const result = AdsRecommendationSchema.safeParse(parsed)
        if (!result.success) throw new Error('Ads Analyst: Invalid output structure')

        span?.generation({
            name: 'ads-analysis',
            model: env.OLLAMA_MODEL,
            input: { system: SYSTEM_PROMPT, prompt },
            output: result.data,
            usage: {
                input: usage?.inputTokens ?? 0,
                output: usage?.outputTokens ?? 0,
            },
        }).end()

        span?.end({ output: { action: result.data.action, urgency: result.data.urgency } })
        logger.info({ action: result.data.action }, '📊 Ads Analyst Agent done')
        return result.data
    } catch (error) {
        span?.end({ output: { error: error instanceof Error ? error.message : 'unknown' } })
        throw error
    }
}
