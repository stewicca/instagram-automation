import { Worker, type Job } from 'bullmq'
import { redisConnection, type GenerateContentPayload } from '../lib/queue.js'
import { contentDraftRepository } from '../repositories/contentDraft.repository.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { generateContent } from '../agents/contentGenerator.js'
import { ContentPillar } from '../generated/prisma/enums.js'
import { logger } from '../lib/logger.js'

function toContentPillar(raw: string): ContentPillar {
    const map: Record<string, ContentPillar> = {
        educational: ContentPillar.EDUCATIONAL,
        promotional: ContentPillar.PROMOTIONAL,
        lifestyle: ContentPillar.LIFESTYLE,
        engagement: ContentPillar.ENGAGEMENT,
        behind_the_scenes: ContentPillar.BEHIND_THE_SCENES,
    }
    return map[raw] ?? ContentPillar.LIFESTYLE
}

async function processGenerateContent(
    job: Job<GenerateContentPayload>
): Promise<void> {
    const startTime = Date.now()
    const { topic, productType, count } = job.data

    logger.info({ jobId: job.id, topic, productType, count }, 'Starting content generation job')

    try {
        for (let i = 0; i < count; i++) {
            await job.updateProgress(Math.round((i / count) * 90))

            const content = await generateContent({ topic, productType })

            await contentDraftRepository.create({
                caption: content.caption,
                hashtags: content.hashtags,
                imagePrompt: content.imagePrompt,
                contentPillar: toContentPillar(content.contentPillar),
                bestPostTime: content.bestPostingTime,
            })

            logger.info(
                { jobId: job.id, index: i + 1, total: count },
                'Content draft saved'
            )
        }

        await job.updateProgress(100)

        await jobLogRepository.create({
            jobName: 'generateContent',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: { topic, productType, count },
            result: { draftsCreated: count },
            duration: Date.now() - startTime,
        })

        logger.info({ jobId: job.id, count }, 'Content generation job completed')
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        await jobLogRepository.create({
            jobName: 'generateContent',
            jobId: job.id ?? 'unknown',
            status: 'failed',
            payload: { topic, productType, count },
            error: message,
            duration: Date.now() - startTime,
        })

        throw error
    }
}

export function createGenerateContentWorker(): Worker {
    const worker = new Worker<GenerateContentPayload>(
        'generateContent',
        processGenerateContent,
        {
            connection: redisConnection,
            concurrency: 1,
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'generateContent job completed')
    })

    worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err }, 'generateContent job failed')
    })

    return worker
}
