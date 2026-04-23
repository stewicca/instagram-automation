import { logger } from './lib/logger.js'
import { redisConnection, queues } from './lib/queue.js'
import { db } from './lib/db.js'
import { createGenerateContentWorker } from './jobs/generateContent.job.js'
import { createPublishPostWorker } from './jobs/publishPost.job.js'
import { setupScheduledJobs } from './jobs/scheduler.js'

async function main() {
    logger.info('Instagram Automation — starting up')

    const workers = [
        createGenerateContentWorker(),
        createPublishPostWorker(),
    ]

    await setupScheduledJobs()

    logger.info(`${workers.length} workers started, system is running`)

    let isShuttingDown = false

    async function shutdown(signal: string): Promise<void> {
        if (isShuttingDown) return
        isShuttingDown = true

        logger.info({ signal }, 'Shutdown signal received — draining workers')

        await Promise.all(workers.map((w) => w.close()))
        logger.info('All workers drained')

        await Promise.all(Object.values(queues).map((q) => q.close()))
        logger.info('All queues closed')

        await redisConnection.quit()
        logger.info('Redis connection closed')

        await db.$disconnect()
        logger.info('Database connection closed')

        logger.info('Shutdown complete')
        process.exit(0)
    }

    process.on('SIGTERM', () => void shutdown('SIGTERM'))
    process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
    logger.fatal({ err }, 'Fatal error during startup')
    process.exit(1)
})
