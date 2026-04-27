/**
 * Fase 8: Telegram Notification Service
 *
 * Kirim notifikasi ke pemilik akun via Telegram Bot API.
 * Digunakan untuk human-in-the-loop approval flow:
 *   - Draft baru siap direview
 *   - Post berhasil dipublish
 *   - Post engagement tinggi → kandidat ads
 *   - Campaign ads dibuat (menunggu aktivasi)
 *
 * Setup:
 * 1. Buat bot via @BotFather di Telegram → dapat TELEGRAM_BOT_TOKEN
 * 2. Chat ke bot kamu, lalu ke @userinfobot untuk dapat TELEGRAM_CHAT_ID
 * 3. Tambahkan ke .env: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 *
 * Jika tidak dikonfigurasi: semua fungsi log ke console (no-op graceful).
 */
import { env } from '../config/env.js'
import { logger } from './logger.js'

const TELEGRAM_API = 'https://api.telegram.org'

function isConfigured(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
}

async function sendMessage(text: string): Promise<void> {
    if (!isConfigured()) {
        logger.debug({ text: text.slice(0, 80) }, '[Telegram] Not configured — skipping notification')
        return
    }

    const url = `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
        }),
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        logger.warn({ status: response.status, body }, 'Telegram notification failed')
        return
    }

    logger.info({ textPreview: text.slice(0, 60) }, 'Telegram notification sent')
}

export const telegram = {
    /**
     * Draft konten baru siap direview.
     * Dikirim setelah generateContent job selesai.
     */
    async notifyDraftReady(params: {
        draftId: string
        caption: string
        contentPillar: string
        reviewUrl: string
    }): Promise<void> {
        const preview = params.caption.slice(0, 120).replace(/\n/g, ' ')
        const text = [
            `📝 <b>Draft Konten Baru</b>`,
            ``,
            `Pillar: <b>${params.contentPillar}</b>`,
            `Preview: ${preview}...`,
            ``,
            `👉 <a href="${params.reviewUrl}">Review & Approve</a>`,
            `ID: <code>${params.draftId.slice(-8)}</code>`,
        ].join('\n')

        await sendMessage(text)
    },

    /**
     * Post berhasil dipublish ke Instagram.
     */
    async notifyPostPublished(params: {
        draftId: string
        instagramPostId: string
        permalink?: string
    }): Promise<void> {
        const text = [
            `✅ <b>Post Berhasil Dipublish!</b>`,
            ``,
            `Instagram Post ID: <code>${params.instagramPostId}</code>`,
            params.permalink ? `🔗 <a href="${params.permalink}">Lihat Post</a>` : '',
            `Draft ID: <code>${params.draftId.slice(-8)}</code>`,
        ].filter(Boolean).join('\n')

        await sendMessage(text)
    },

    /**
     * Post organik mendapat engagement tinggi → kandidat untuk di-boost.
     * Dikirim setelah fetchAnalytics job mendeteksi engagementRate >= 3%.
     */
    async notifyHighEngagement(params: {
        draftId: string
        instagramPostId: string
        engagementRate: number
        reach: number
    }): Promise<void> {
        const text = [
            `🎯 <b>Post Engagement Tinggi!</b>`,
            ``,
            `Engagement Rate: <b>${params.engagementRate.toFixed(2)}%</b>`,
            `Reach: ${params.reach.toLocaleString()} orang`,
            ``,
            `Kandidat untuk di-boost dengan Meta Ads.`,
            `Cek Business Manager setelah runAdsCheck job berjalan.`,
            ``,
            `Post ID: <code>${params.instagramPostId}</code>`,
        ].join('\n')

        await sendMessage(text)
    },

    /**
     * Campaign Meta Ads baru dibuat dengan status PAUSED.
     * Dikirim setelah runAdsCheck job membuat boost campaign.
     */
    async notifyAdsCampaignCreated(params: {
        campaignId: string
        instagramPostId: string
        dailyBudgetIdr: number
        summary: string
    }): Promise<void> {
        const text = [
            `🚀 <b>Boost Campaign Dibuat (PAUSED)</b>`,
            ``,
            `${params.summary}`,
            ``,
            `Budget harian: <b>Rp ${params.dailyBudgetIdr.toLocaleString()}</b>`,
            ``,
            `👉 Aktifkan di <a href="https://business.facebook.com">Meta Business Manager</a>`,
            `Campaign ID: <code>${params.campaignId}</code>`,
        ].join('\n')

        await sendMessage(text)
    },

    /**
     * Draft ditolak — simpan feedback untuk training.
     */
    async notifyDraftRejected(params: {
        draftId: string
        feedback: string
        reviewUrl: string
    }): Promise<void> {
        const text = [
            `❌ <b>Draft Ditolak</b>`,
            ``,
            `Feedback: ${params.feedback}`,
            ``,
            `👉 <a href="${params.reviewUrl}">Lihat Draft Lain</a>`,
            `ID: <code>${params.draftId.slice(-8)}</code>`,
        ].join('\n')

        await sendMessage(text)
    },

    isConfigured,
    sendMessage,
}
