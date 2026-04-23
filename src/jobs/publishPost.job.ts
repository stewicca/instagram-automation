import { Worker, type Job } from 'bullmq'
import { redisConnection, type PublishPostPayload } from '../lib/queue.js'
import { contentDraftRepository } from '../repositories/contentDraft.repository.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { logger } from '../lib/logger.js'

async function processPublishPost(
    job: Job<PublishPostPayload>
): Promise<void> {
    const startTime = Date.now()
    const { contentDraftId } = job.data

    logger.info({ jobId: job.id, contentDraftId }, 'Starting publish post job')

    try {
        const mockInstagramPostId = `ig_mock_${Date.now()}`

        await contentDraftRepository.markPublished(contentDraftId, mockInstagramPostId)

        await jobLogRepository.create({
            jobName: 'publishPost',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: { contentDraftId },
            result: { instagramPostId: mockInstagramPostId },
            duration: Date.now() - startTime,
        })

        logger.info(
            { jobId: job.id, contentDraftId, mockInstagramPostId },
            'Publish post job completed'
        )

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

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
            concurrency: 1,
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'publishPost job completed')
    })

    worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err }, 'publishPost job failed')
    })

    return worker
}
