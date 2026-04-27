/**
 * Fase 5: Fetch Analytics Worker
 *
 * Job ini dipanggil 24 jam setelah post dipublish untuk fetch metrics dari
 * Instagram Insights API, lalu simpan ke DB.
 *
 * Kenapa delayed?
 * - Instagram Insights butuh ~2 jam setelah publish untuk tersedia
 * - Ambil di 24 jam = data sudah stabil, bisa dipakai untuk keputusan ads
 *
 * Business logic setelah fetch:
 * - Jika engagementRate > 3% → kandidat untuk di-boost (Fase 7)
 * - Data tersimpan di PostAnalytics → Analytics Interpreter Agent bisa baca
 */
import { Worker, type Job } from 'bullmq'
import { redisConnection, type FetchAnalyticsPayload } from '../lib/queue.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { postAnalyticsRepository } from '../repositories/postAnalytics.repository.js'
import { createInstagramClient } from '../instagram/client.js'
import { InstagramApiError } from '../instagram/types.js'
import { telegram } from '../lib/telegram.js'
import { logger } from '../lib/logger.js'

// Threshold engagement rate untuk flag sebagai kandidat ads
const HIGH_ENGAGEMENT_THRESHOLD = 3.0

async function processFetchAnalytics(
    job: Job<FetchAnalyticsPayload>
): Promise<void> {
    const startTime = Date.now()
    const { contentDraftId, instagramPostId } = job.data

    logger.info({ jobId: job.id, contentDraftId, instagramPostId }, 'Starting fetch analytics job')

    const instagram = createInstagramClient()

    try {
        // Fetch insights dari Instagram Insights API
        const insights = await instagram.fetchPostInsights(instagramPostId)

        // Simpan ke DB (upsert — aman jika di-retry)
        await postAnalyticsRepository.upsert({
            contentDraftId,
            instagramPostId,
            insights,
        })

        // Flag post dengan engagement bagus
        if (insights.engagementRate >= HIGH_ENGAGEMENT_THRESHOLD) {
            logger.info(
                {
                    contentDraftId,
                    engagementRate: `${insights.engagementRate.toFixed(2)}%`,
                    reach: insights.reach,
                },
                `🎯 High engagement post detected (>= ${HIGH_ENGAGEMENT_THRESHOLD}%) — candidate for ads boost`
            )

            await telegram.notifyHighEngagement({
                draftId: contentDraftId,
                instagramPostId,
                engagementRate: insights.engagementRate,
                reach: insights.reach,
            })
        }

        await jobLogRepository.create({
            jobName: 'fetchAnalytics',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: { contentDraftId, instagramPostId },
            result: {
                engagementRate: insights.engagementRate,
                reach: insights.reach,
                impressions: insights.impressions,
            },
            duration: Date.now() - startTime,
        })

        logger.info(
            { jobId: job.id, contentDraftId, engagementRate: insights.engagementRate },
            'Fetch analytics job completed'
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        // Insights belum tersedia 2 jam setelah publish — bukan error fatal
        const isInsightsNotReady =
            error instanceof InstagramApiError &&
            error.message.includes('Insights')

        if (isInsightsNotReady) {
            logger.warn(
                { jobId: job.id, contentDraftId },
                'Insights not ready yet — job will be retried by BullMQ'
            )
        }

        await jobLogRepository.create({
            jobName: 'fetchAnalytics',
            jobId: job.id ?? 'unknown',
            status: 'failed',
            payload: { contentDraftId, instagramPostId },
            error: message,
            duration: Date.now() - startTime,
        })

        throw error
    }
}

export function createFetchAnalyticsWorker(): Worker {
    const worker = new Worker<FetchAnalyticsPayload>(
        'fetchAnalytics',
        processFetchAnalytics,
        {
            connection: redisConnection,
            concurrency: 3, // bisa fetch analytics untuk beberapa post paralel
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'fetchAnalytics job completed')
    })

    worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err }, 'fetchAnalytics job failed')
    })

    return worker
}
