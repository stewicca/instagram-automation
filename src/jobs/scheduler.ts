import { queues } from '../lib/queue.js'
import { logger } from '../lib/logger.js'

const DAILY_CONTENT_CRON = '0 0 * * *'

export async function setupScheduledJobs(): Promise<void> {
    const existingRepeatables = await queues.generateContent.getRepeatableJobs()
    for (const job of existingRepeatables) {
        await queues.generateContent.removeRepeatableByKey(job.key)
        logger.info({ jobKey: job.key }, 'Removed existing repeatable job')
    }

    await queues.generateContent.add(
        'daily-content-generation',
        {
            topic: 'fashion terkini',
            productType: 'pakaian wanita casual',
            count: 3,
        },
        {
            repeat: { pattern: DAILY_CONTENT_CRON },
        }
    )

    logger.info(
        { cron: DAILY_CONTENT_CRON },
        'Scheduled daily content generation at 07:00 WIB'
    )
}
