import { describe, it, expect, vi } from 'vitest'
import { ContentStatus, ContentPillar } from '../src/generated/prisma/enums.js'

const { testDb } = await vi.hoisted(async () => {
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const { PrismaClient } = await import('../src/generated/prisma/client.js')

    const adapter = new PrismaPg({
        connectionString: process.env['DATABASE_URL_TEST'],
    })

    const testDb = new PrismaClient({ adapter })
    return { testDb }
})

vi.mock('../src/lib/db.js', () => ({
    db: testDb,
}))

const { contentDraftRepository } = await import(
    '../src/repositories/contentDraft.repository.js'
)

const MOCK_DRAFT_INPUT = {
    caption: 'Kemeja batik modern untuk meeting — elegan tanpa batas. 🌿',
    hashtags: ['#BatikModern', '#NusantaraWear', '#OOTD'],
    imagePrompt: 'Elegant batik shirt flat lay on marble surface, natural light',
    contentPillar: ContentPillar.LIFESTYLE,
    bestPostTime: 'Selasa 19:00 WIB',
}

describe('contentDraftRepository', () => {
    describe('create', () => {
        it('menyimpan draft baru dengan status PENDING_REVIEW', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)

            expect(draft.id).toBeTruthy()
            expect(draft.status).toBe(ContentStatus.PENDING_REVIEW)
            expect(draft.caption).toBe(MOCK_DRAFT_INPUT.caption)
            expect(draft.hashtags).toEqual(MOCK_DRAFT_INPUT.hashtags)
            expect(draft.contentPillar).toBe(ContentPillar.LIFESTYLE)
        })
    })

    describe('findPendingReview', () => {
        it('hanya return draft dengan status PENDING_REVIEW', async () => {
            const draft1 = await contentDraftRepository.create(MOCK_DRAFT_INPUT)
            const draft2 = await contentDraftRepository.create(MOCK_DRAFT_INPUT)

            await contentDraftRepository.approve(draft1.id, new Date())

            const pending = await contentDraftRepository.findPendingReview()

            expect(pending).toHaveLength(1)
            expect(pending[0]?.id).toBe(draft2.id)
        })
    })

    describe('approve', () => {
        it('mengubah status menjadi APPROVED dan set scheduledAt', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)
            const scheduledAt = new Date('2026-12-01T11:00:00Z')

            const approved = await contentDraftRepository.approve(draft.id, scheduledAt)

            expect(approved.status).toBe(ContentStatus.APPROVED)
            expect(approved.scheduledAt).toEqual(scheduledAt)
        })
    })

    describe('rejectWithFeedback', () => {
        it('mengubah status menjadi REJECTED dan simpan feedback', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)
            const feedback = 'Caption terlalu formal, kurang personal'

            const rejected = await contentDraftRepository.rejectWithFeedback(
                draft.id,
                feedback
            )

            expect(rejected.status).toBe(ContentStatus.REJECTED)
            expect(rejected.feedback).toBe(feedback)
        })

        it('menyimpan RejectionFeedback dengan caption dan imagePrompt', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)
            const feedback = 'Gambar tidak sesuai brand'

            await contentDraftRepository.rejectWithFeedback(draft.id, feedback)

            const savedFeedback = await testDb.rejectionFeedback.findFirst({
                where: { contentDraftId: draft.id },
            })

            expect(savedFeedback).toBeTruthy()
            expect(savedFeedback?.caption).toBe(MOCK_DRAFT_INPUT.caption)
            expect(savedFeedback?.imagePrompt).toBe(MOCK_DRAFT_INPUT.imagePrompt)
            expect(savedFeedback?.feedback).toBe(feedback)
        })
    })

    describe('markPublished', () => {
        it('mengubah status menjadi PUBLISHED dan simpan instagramPostId', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)
            const instagramPostId = 'ig_post_123456'

            const published = await contentDraftRepository.markPublished(
                draft.id,
                instagramPostId
            )

            expect(published.status).toBe(ContentStatus.PUBLISHED)
            expect(published.instagramPostId).toBe(instagramPostId)
            expect(published.publishedAt).toBeTruthy()
        })
    })

    describe('findDueForPublishing', () => {
        it('return draft yang scheduledAt-nya sudah lewat', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)

            await contentDraftRepository.approve(
                draft.id,
                new Date('2020-01-01T00:00:00Z')
            )

            const due = await contentDraftRepository.findDueForPublishing()

            expect(due.some((d) => d.id === draft.id)).toBe(true)
        })

        it('tidak return draft yang scheduledAt-nya belum tiba', async () => {
            const draft = await contentDraftRepository.create(MOCK_DRAFT_INPUT)

            await contentDraftRepository.approve(
                draft.id,
                new Date('2099-01-01T00:00:00Z')
            )

            const due = await contentDraftRepository.findDueForPublishing()

            expect(due.some((d) => d.id === draft.id)).toBe(false)
        })
    })
})
