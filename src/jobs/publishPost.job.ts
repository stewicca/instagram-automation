/**
 * Fase 5: Publish Post Worker
 *
 * Worker ini dipanggil ketika ContentDraft sudah di-approve dan scheduledAt sudah lewat.
 * Menggunakan InstagramClient sungguhan (bukan mock).
 *
 * Setelah publish berhasil:
 * - ContentDraft.status → PUBLISHED
 * - ContentDraft.instagramPostId disimpan (untuk fetch analytics nanti)
 * - Job fetchAnalytics di-schedule 24 jam ke depan
 */
import { Worker, type Job } from 'bullmq'
import { redisConnection, queues, type PublishPostPayload } from '../lib/queue.js'
import { contentDraftRepository } from '../repositories/contentDraft.repository.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { createInstagramClient } from '../instagram/client.js'
import { InstagramApiError } from '../instagram/types.js'
import { telegram } from '../lib/telegram.js'
import { db } from '../lib/db.js'
import { logger } from '../lib/logger.js'

// Delay sebelum fetch analytics: 24 jam
// Instagram Insights butuh minimal ~2 jam, kita tunggu 24 jam agar data stabil
const ANALYTICS_DELAY_MS = 24 * 60 * 60 * 1000

async function processPublishPost(
    job: Job<PublishPostPayload>
): Promise<void> {
    const startTime = Date.now()
    const { contentDraftId } = job.data

    logger.info({ jobId: job.id, contentDraftId }, 'Starting publish post job')

    // Load draft yang akan dipublish
    const draft = await db.contentDraft.findUniqueOrThrow({
        where: { id: contentDraftId },
    })

    if (!draft.imageUrl) {
        throw new Error(`ContentDraft ${contentDraftId} has no imageUrl — cannot publish without image`)
    }

    const instagram = createInstagramClient()

    try {
        // Gabungkan caption + hashtags menjadi satu string
        // Instagram tidak punya field terpisah untuk hashtag — ditambahkan ke caption
        const fullCaption = [
            draft.caption,
            '',
            draft.hashtags.join(' '),
        ].join('\n')

        // Publish ke Instagram via Graph API (2-step flow)
        const published = await instagram.publishPhoto({
            imageUrl: draft.imageUrl,
            caption: fullCaption,
        })

        // Update DB: tandai sudah dipublish, simpan Instagram post ID
        await contentDraftRepository.markPublished(contentDraftId, published.postId)

        // Notifikasi ke pemilik bahwa post berhasil dipublish
        await telegram.notifyPostPublished({
            draftId: contentDraftId,
            instagramPostId: published.postId,
            permalink: published.permalink,
        })

        // Schedule fetch analytics 24 jam ke depan
        await queues.fetchAnalytics.add(
            'fetchAnalytics',
            {
                contentDraftId,
                instagramPostId: published.postId,
            },
            {
                delay: ANALYTICS_DELAY_MS,
                // Jika analytics gagal, retry setiap 6 jam (3 kali)
                attempts: 3,
                backoff: { type: 'fixed', delay: 6 * 60 * 60 * 1000 },
            }
        )

        await jobLogRepository.create({
            jobName: 'publishPost',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: { contentDraftId },
            result: {
                instagramPostId: published.postId,
                permalink: published.permalink,
            },
            duration: Date.now() - startTime,
        })

        logger.info(
            {
                jobId: job.id,
                contentDraftId,
                instagramPostId: published.postId,
                permalink: published.permalink,
            },
            'Post published to Instagram successfully'
        )

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        // Log detail untuk Instagram API errors
        if (error instanceof InstagramApiError) {
            logger.error(
                {
                    jobId: job.id,
                    contentDraftId,
                    errorCode: error.code,
                    errorSubcode: error.subcode,
                    isRateLimit: error.isRateLimit(),
                    isTokenError: error.isTokenError(),
                },
                `Instagram API error during publish: ${message}`
            )

            if (error.isTokenError()) {
                logger.error('⚠️  ACTION REQUIRED: Instagram access token expired — update INSTAGRAM_ACCESS_TOKEN')
            }
        }

        await contentDraftRepository.markFailed(contentDraftId, message)

        await jobLogRepository.create({
            jobName: 'publishPost',
            jobId: job.id ?? 'unknown',
            status: 'failed',
            payload: { contentDraftId },
            error: message,
            duration: Date.now() - startTime,
        })

        throw error
    }
}

export function createPublishPostWorker(): Worker {
    const worker = new Worker<PublishPostPayload>(
        'publishPost',
        processPublishPost,
        {
            connection: redisConnection,
            // Concurrency 1 — jangan publish paralel, bisa kena rate limit Instagram
            // Instagram max 25 posts per 24 jam per akun
            concurrency: 1,
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'publishPost job completed')
    })

    worker.on('failed', (job, err) => {
        const isTokenError = err instanceof InstagramApiError && err.isTokenError()
        logger.error(
            { jobId: job?.id, err, tokenExpired: isTokenError },
            isTokenError
                ? 'publishPost failed: Instagram token expired — check INSTAGRAM_ACCESS_TOKEN'
                : 'publishPost job failed'
        )
    })

    return worker
}
