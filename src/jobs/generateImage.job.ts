/**
 * Fase 6: Generate Image Worker
 *
 * Dipanggil setelah content draft di-generate (atau secara terpisah).
 * Menjalankan full image pipeline: Gemini → Sharp → Storage → DB update.
 *
 * Alur dalam sistem:
 *   generateContent job → (selesai) → dispatch generateImage job
 *   → imageUrl tersimpan di ContentDraft
 *   → Owner bisa review gambar + caption sekaligus
 */
import { Worker, type Job } from 'bullmq'
import { redisConnection, type GenerateImagePayload } from '../lib/queue.js'
import { jobLogRepository } from '../repositories/jobLog.repository.js'
import { generateImageForDraft } from '../services/imageGenerationService.js'
import { logger } from '../lib/logger.js'

async function processGenerateImage(
    job: Job<GenerateImagePayload>
): Promise<void> {
    const startTime = Date.now()
    const { contentDraftId, imagePrompt, format } = job.data

    logger.info({ jobId: job.id, contentDraftId }, 'Starting generate image job')

    try {
        const result = await generateImageForDraft({ contentDraftId, imagePrompt, format: format ?? 'square' })

        await jobLogRepository.create({
            jobName: 'generateImage',
            jobId: job.id ?? 'unknown',
            status: 'completed',
            payload: { contentDraftId, format },
            result: { imageUrl: result.imageUrl, storage: result.storage, durationMs: result.durationMs },
            duration: Date.now() - startTime,
        })

        logger.info(
            { jobId: job.id, contentDraftId, imageUrl: result.imageUrl },
            'Generate image job completed'
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        await jobLogRepository.create({
            jobName: 'generateImage',
            jobId: job.id ?? 'unknown',
            status: 'failed',
            payload: { contentDraftId },
            error: message,
            duration: Date.now() - startTime,
        })

        throw error
    }
}

export function createGenerateImageWorker(): Worker {
    const worker = new Worker<GenerateImagePayload>(
        'generateImage',
        processGenerateImage,
        {
            connection: redisConnection,
            concurrency: 2, // generate 2 gambar paralel
        }
    )

    worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'generateImage job completed')
    })

    worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, err }, 'generateImage job failed')
    })

    return worker
}
