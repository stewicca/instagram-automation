/**
 * Fase 7: Run Ads Check Worker
 *
 * Job harian yang:
 * 1. Temukan post organik dengan engagementRate >= 3% yang belum di-boost
 * 2. Jalankan Ads Analyst Agent untuk evaluasi kelayakan boost
 * 3. Jika layak (BOOST_NEW): buat campaign PAUSED di Meta Ads API
 * 4. Tandai PostAnalytics.boosted = true agar tidak di-proses ulang
 *
 * Keamanan: semua campaign dibuat dengan status PAUSED.
 * Tidak ada uang keluar sampai pemilik aktifkan manual.
 *
 * Jika META_ADS_ACCESS_TOKEN tidak dikonfigurasi:
 * - Agent tetap berjalan untuk menghasilkan rekomendasi
 * - Rekomendasi hanya di-log (tidak create campaign)
 */
import { Worker, type Job } from 'bullmq'
import { redisConnection, type RunAdsCheckPayload } from '../lib/queue.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { postAnalyticsRepository, type PostAnalyticsWithDraft } from '../repositories/postAnalytics.repository.js'
import { runAdsAnalystAgent } from '../agents/specialists/adsAnalystAgent.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

const HIGH_ENGAGEMENT_THRESHOLD = 3.0

async function processRunAdsCheck(job: Job<RunAdsCheckPayload>): Promise<void> {
    const startTime = Date.now()

    logger.info({ jobId: job.id }, 'Starting ads check job')

    // Lazy import — MetaAdsClient hanya dipakai jika env dikonfigurasi
    // Ini mencegah error constructor jika META_ADS vars tidak ada
    const hasAdsConfig = Boolean(env.META_ADS_ACCOUNT_ID && env.META_ADS_ACCESS_TOKEN)

    let adsClient: import('../instagram/adsClient.js').MetaAdsClient | null = null
    if (hasAdsConfig) {
        const { createAdsClient } = await import('../instagram/adsClient.js')
        adsClient = createAdsClient()
    }

    try {
        // Temukan post organik bagus yang belum di-boost
        const candidates = await postAnalyticsRepository.findHighEngagement(HIGH_ENGAGEMENT_THRESHOLD)

        logger.info({ count: candidates.length }, `Found ${candidates.length} high-engagement post(s) to evaluate`)

        let boostedCount = 0
        const recommendations: Array<{ postId: string; action: string; reasoning: string }> = []

        for (const analytics of candidates as PostAnalyticsWithDraft[]) {
            logger.info(
                {
                    contentDraftId: analytics.contentDraftId,
                    engagementRate: `${analytics.engagementRate.toFixed(2)}%`,
                },
                'Evaluating post for ads boost'
            )

            // Analyst agent mengevaluasi apakah post ini layak di-boost
            const recommendation = await runAdsAnalystAgent({
                postEngagementRate: analytics.engagementRate,
                postReach: analytics.reach,
            })

            recommendations.push({
                postId: analytics.instagramPostId,
                action: recommendation.action,
                reasoning: recommendation.reasoning,
            })

            logger.info(
                {
                    action: recommendation.action,
                    urgency: recommendation.urgency,
                    summary: recommendation.summary,
                },
                'Ads Analyst recommendation'
            )

            if (recommendation.action !== 'BOOST_NEW') {
                logger.info(
                    { action: recommendation.action },
                    'Post not recommended for boost — skipping'
                )
                continue
            }

            const dailyBudgetIdr = recommendation.suggestedDailyBudgetIdr ?? 50_000

            if (!adsClient) {
                // Meta Ads tidak dikonfigurasi — hanya log rekomendasi
                logger.info(
                    {
                        contentDraftId: analytics.contentDraftId,
                        dailyBudgetIdr,
                        summary: recommendation.summary,
                    },
                    '💡 Ads recommendation (META_ADS not configured — manual action required)'
                )
                continue
            }

            const draft = analytics.contentDraft
            if (!draft?.instagramPostId) {
                logger.warn(
                    { contentDraftId: analytics.contentDraftId },
                    'ContentDraft missing instagramPostId — cannot create boost campaign'
                )
                continue
            }

            // Buat campaign PAUSED di Meta Ads
            const campaign = await adsClient.createBoostCampaign({
                instagramPostId: draft.instagramPostId,
                instagramAccountId: env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
                postCaption: (draft.caption ?? '').slice(0, 80),
                dailyBudgetIdr,
            })

            // Tandai sebagai boosted — tidak akan di-proses lagi oleh job ini
            await postAnalyticsRepository.markBoosted(analytics.contentDraftId, campaign.campaignId)

            boostedCount++

            logger.info(
                {
                    contentDraftId: analytics.contentDraftId,
                    campaignId: campaign.campaignId,
                    adSetId: campaign.adSetId,
                    adId: campaign.adId,
                    dailyBudgetIdr,
                },
                '🚀 Boost campaign created (PAUSED — awaiting manual activation)'
            )
        }

        await jobLogRepository.create({
            jobName: 'runAdsCheck',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: {},
            result: {
                candidatesEvaluated: candidates.length,
                boostedCount,
                recommendations,
            },
            duration: Date.now() - startTime,
        })

        logger.info(
            { evaluated: candidates.length, boosted: boostedCount },
            'Ads check job completed'
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        await jobLogRepository.create({
            jobName: 'runAdsCheck',
            jobId: job.id ?? 'unknown',
            status: 'failed',
            payload: {},
            error: message,
            duration: Date.now() - startTime,
        })

        throw error
    }
}

export function createRunAdsCheckWorker(): Worker {
    const worker = new Worker<RunAdsCheckPayload>(
        'runAdsCheck',
        processRunAdsCheck,
        {
            connection: redisConnection,
            concurrency: 1, // satu ads check pada satu waktu — cukup
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'runAdsCheck job completed')
    })

    worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err }, 'runAdsCheck job failed')
    })

    return worker
}
