import { db } from '../lib/db.js'
import { ContentStatus, ContentPillar } from '../generated/prisma/enums.js'
import type { ContentDraft } from '../generated/prisma/client.js'
import { logger } from '../lib/logger.js'

export type CreateContentDraftInput = {
    caption: string
    hashtags: string[]
    imagePrompt: string
    contentPillar: ContentPillar
    bestPostTime?: string
}

export const contentDraftRepository = {
    async create(input: CreateContentDraftInput): Promise<ContentDraft> {
        const draft = await db.contentDraft.create({ data: input })
        logger.info({ draftId: draft.id, contentPillar: draft.contentPillar }, 'Content draft created')
        return draft
    },
    async findPendingReview(): Promise<ContentDraft[]> {
        return db.contentDraft.findMany({
            where: { status: ContentStatus.PENDING_REVIEW },
            orderBy: { createdAt: 'desc' },
        })
    },
    async approve(id: string, scheduledAt: Date): Promise<ContentDraft> {
        const draft = await db.contentDraft.update({
            where: { id },
            data: {
                status: ContentStatus.APPROVED,
                scheduledAt,
            },
        })
        logger.info({ draftId: id, scheduledAt }, 'Content draft approved')
        return draft
    },
    async reject(id: string, feedback: string): Promise<ContentDraft> {
        const [draft] = await db.$transaction([
            db.contentDraft.update({
                where: { id },
                data: { status: ContentStatus.REJECTED, feedback },
            }),
            db.rejectionFeedback.create({
                data: {
                    contentDraftId: id,
                    caption: '',
                    imagePrompt: '',
                    feedback,
                },
            }),
        ])
        logger.info({ draftId: id }, 'Content draft rejected')
        return draft
    },
    async rejectWithFeedback(id: string, feedback: string): Promise<ContentDraft> {
        return db.$transaction(async (tx) => {
            const draft = await tx.contentDraft.findUniqueOrThrow({
                where: { id },
            })

            const updated = await tx.contentDraft.update({
                where: { id },
                data: { status: ContentStatus.REJECTED, feedback },
            })

            await tx.rejectionFeedback.create({
                data: {
                    contentDraftId: id,
                    caption: draft.caption,
                    imagePrompt: draft.imagePrompt,
                    feedback,
                },
            })

            logger.info({ draftId: id, feedback }, 'Content draft rejected with feedback')
            return updated
        })
    },
    async markPublished(id: string, instagramPostId: string): Promise<ContentDraft> {
        const draft = await db.contentDraft.update({
            where: { id },
            data: {
                status: ContentStatus.PUBLISHED,
                instagramPostId,
                publishedAt: new Date(),
            },
        })
        logger.info({ draftId: id, instagramPostId }, 'Content draft marked as published')
        return draft
    },
    async findDueForPublishing(): Promise<ContentDraft[]> {
        return db.contentDraft.findMany({
            where: {
                status: ContentStatus.APPROVED,
                scheduledAt: { lte: new Date() },
            },
        })
    },
    async markFailed(id: string, error: string): Promise<ContentDraft> {
        return db.contentDraft.update({
            where: { id },
            data: { status: ContentStatus.FAILED, feedback: error },
        })
    },
}
