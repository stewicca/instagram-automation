/**
 * Fase 8: Review Dashboard Routes
 *
 * Human-in-the-loop approval flow untuk content drafts.
 *
 * Endpoints:
 *   GET  /review/drafts              — daftar draft PENDING_REVIEW
 *   GET  /review/drafts/:id          — detail satu draft
 *   POST /review/drafts/:id/approve  — approve + schedule publish
 *   POST /review/drafts/:id/reject   — reject + simpan feedback
 *
 * Approve → draft masuk ke publishPost queue (terjadwal)
 * Reject  → feedback tersimpan di DB sebagai training data untuk agent
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { contentDraftRepository } from '../../repositories/contentDraft.repository.js'
import { queues } from '../../lib/queue.js'
import { telegram } from '../../lib/telegram.js'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'

const review = new Hono()

const ApproveBodySchema = z.object({
    // ISO string atau jumlah menit dari sekarang
    scheduledAt: z.string().datetime().optional(),
    scheduleInMinutes: z.number().int().positive().optional(),
})

const RejectBodySchema = z.object({
    feedback: z.string().min(1, 'Feedback tidak boleh kosong'),
})

function getReviewUrl(draftId: string): string {
    const base = `http://localhost:${env.PORT}`
    return `${base}/review/drafts/${draftId}`
}

// GET /review/drafts — list semua draft yang menunggu review
review.get('/drafts', async (c) => {
    const drafts = await contentDraftRepository.findPendingReview()

    return c.json({
        count: drafts.length,
        drafts: drafts.map(d => ({
            id: d.id,
            status: d.status,
            contentPillar: d.contentPillar,
            captionPreview: d.caption.slice(0, 100),
            hashtagCount: d.hashtags.length,
            hasImage: Boolean(d.imageUrl),
            imageUrl: d.imageUrl,
            bestPostTime: d.bestPostTime,
            createdAt: d.createdAt,
        })),
    })
})

// GET /review/drafts/:id — detail lengkap draft
review.get('/drafts/:id', async (c) => {
    const { id } = c.req.param()

    try {
        const draft = await contentDraftRepository.findPendingReview()
            .then(drafts => drafts.find(d => d.id === id))

        if (!draft) {
            return c.json({ error: 'Draft tidak ditemukan atau sudah diproses' }, 404)
        }

        return c.json(draft)
    } catch {
        return c.json({ error: 'Gagal mengambil draft' }, 500)
    }
})

// POST /review/drafts/:id/approve
review.post('/drafts/:id/approve', async (c) => {
    const { id } = c.req.param()

    let body: z.infer<typeof ApproveBodySchema>
    try {
        body = ApproveBodySchema.parse(await c.req.json().catch(() => ({})))
    } catch (err) {
        return c.json({ error: 'Invalid body', details: err }, 400)
    }

    let scheduledAt: Date
    if (body.scheduledAt) {
        scheduledAt = new Date(body.scheduledAt)
    } else if (body.scheduleInMinutes) {
        scheduledAt = new Date(Date.now() + body.scheduleInMinutes * 60 * 1000)
    } else {
        // Default: publish 10 menit dari sekarang
        scheduledAt = new Date(Date.now() + 10 * 60 * 1000)
    }

    try {
        const draft = await contentDraftRepository.approve(id, scheduledAt)

        // Hitung delay sampai waktu publish
        const delayMs = Math.max(0, scheduledAt.getTime() - Date.now())

        await queues.publishPost.add(
            `publish-${id}`,
            { contentDraftId: id },
            { delay: delayMs }
        )

        logger.info({ draftId: id, scheduledAt, delayMs }, 'Draft approved and queued for publishing')

        return c.json({
            success: true,
            draft: {
                id: draft.id,
                status: draft.status,
                scheduledAt: draft.scheduledAt,
            },
            publishDelay: `${Math.round(delayMs / 60_000)} menit`,
        })
    } catch {
        return c.json({ error: 'Gagal approve draft' }, 500)
    }
})

// POST /review/drafts/:id/reject
review.post('/drafts/:id/reject', async (c) => {
    const { id } = c.req.param()

    let body: z.infer<typeof RejectBodySchema>
    try {
        const raw = await c.req.json()
        body = RejectBodySchema.parse(raw)
    } catch (err) {
        return c.json({ error: 'Feedback wajib diisi', details: err }, 400)
    }

    try {
        const draft = await contentDraftRepository.rejectWithFeedback(id, body.feedback)

        logger.info({ draftId: id, feedback: body.feedback }, 'Draft rejected')

        await telegram.notifyDraftRejected({
            draftId: id,
            feedback: body.feedback,
            reviewUrl: getReviewUrl('pending'),
        })

        return c.json({
            success: true,
            draft: { id: draft.id, status: draft.status },
            message: 'Feedback tersimpan sebagai training data untuk agent',
        })
    } catch {
        return c.json({ error: 'Gagal reject draft' }, 500)
    }
})

export { review }
