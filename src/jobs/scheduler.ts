/**
 * Fase 8: Job Scheduler
 *
 * Mendaftarkan semua repeatable (cron) jobs ke BullMQ.
 * Setup dijalankan sekali saat startup — BullMQ menyimpan jadwal di Redis.
 *
 * Jadwal (WIB = UTC+7):
 *   07:00 WIB — generateContent   : buat 3 draft konten harian
 *   09:00 WIB — runAdsCheck       : cek post high-engagement, buat boost campaign
 *   20:00 WIB — refreshAnalytics  : refresh analytics untuk semua published posts
 */
import { queues } from '../lib/queue.js'
import { logger } from '../lib/logger.js'

// Cron dalam UTC (server time)
const CRONS = {
    // 07:00 WIB = 00:00 UTC
    generateContent: '0 0 * * *',
    // 09:00 WIB = 02:00 UTC
    runAdsCheck: '0 2 * * *',
    // 20:00 WIB = 13:00 UTC
    refreshAnalytics: '0 13 * * *',
} as const

export async function setupScheduledJobs(): Promise<void> {
    // Bersihkan semua repeatable jobs lama sebelum mendaftar ulang
    // Ini memastikan perubahan jadwal langsung berlaku saat restart
    await clearRepeatableJobs()

    await queues.generateContent.add(
        'daily-content-generation',
        {
            topic: 'fashion terkini',
            productType: 'pakaian wanita casual',
            count: 3,
        },
        { repeat: { pattern: CRONS.generateContent } }
    )

    await queues.runAdsCheck.add(
        'daily-ads-check',
        {},
        { repeat: { pattern: CRONS.runAdsCheck } }
    )

    // fetchAnalytics memakai payload contentDraftId + instagramPostId
    // Untuk scheduled refresh, dispatch dari sini menggunakan fetchAnalytics queue
    // Tapi BullMQ repeatable jobs tidak bisa tahu ID post yang akan ada di masa depan.
    // Solusi: job khusus "refreshAllAnalytics" yang query DB lalu dispatch fetchAnalytics per post
    await queues.fetchAnalytics.add(
        'daily-analytics-refresh-trigger',
        { contentDraftId: '__scheduled_refresh__', instagramPostId: '__all__' },
        { repeat: { pattern: CRONS.refreshAnalytics } }
    )

    logger.info(
        {
            generateContent: CRONS.generateContent,
            runAdsCheck: CRONS.runAdsCheck,
            refreshAnalytics: CRONS.refreshAnalytics,
        },
        'Scheduled jobs registered'
    )
}

async function clearRepeatableJobs(): Promise<void> {
    const allQueues = [queues.generateContent, queues.runAdsCheck, queues.fetchAnalytics]

    await Promise.all(
        allQueues.map(async (queue) => {
            const existing = await queue.getRepeatableJobs()
            for (const job of existing) {
                await queue.removeRepeatableByKey(job.key)
                logger.info({ queue: queue.name, jobKey: job.key }, 'Removed existing repeatable job')
            }
        })
    )
}
