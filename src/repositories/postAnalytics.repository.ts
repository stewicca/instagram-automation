import { db } from '../lib/db.js'
import type { PostAnalytics, ContentDraft } from '../generated/prisma/client.js'
import { logger } from '../lib/logger.js'
import type { IGPostInsights } from '../instagram/types.js'

export type PostAnalyticsWithDraft = PostAnalytics & { contentDraft: ContentDraft }

export const postAnalyticsRepository = {
    /**
     * Simpan atau update analytics untuk sebuah post.
     * Upsert karena analytics di-fetch berulang kali (24 jam, 7 hari).
     */
    async upsert(params: {
        contentDraftId: string
        instagramPostId: string
        insights: IGPostInsights
    }): Promise<PostAnalytics> {
        const { contentDraftId, instagramPostId, insights } = params

        const analytics = await db.postAnalytics.upsert({
            where: { contentDraftId },
            create: {
                contentDraftId,
                instagramPostId,
                impressions: insights.impressions,
                reach: insights.reach,
                likes: insights.likes,
                comments: insights.comments,
                saves: insights.saves,
                shares: insights.shares,
                engagementRate: insights.engagementRate,
            },
            update: {
                impressions: insights.impressions,
                reach: insights.reach,
                likes: insights.likes,
                comments: insights.comments,
                saves: insights.saves,
                shares: insights.shares,
                engagementRate: insights.engagementRate,
                fetchedAt: new Date(),
            },
        })

        logger.info(
            {
                contentDraftId,
                instagramPostId,
                engagementRate: `${insights.engagementRate.toFixed(2)}%`,
                reach: insights.reach,
            },
            'PostAnalytics upserted'
        )

        return analytics
    },

    async findByContentDraftId(contentDraftId: string): Promise<PostAnalytics | null> {
        return db.postAnalytics.findUnique({ where: { contentDraftId } })
    },

    /**
     * Cari post dengan engagement rate tinggi — kandidat untuk di-boost dengan ads.
     * Gunakan threshold 3% sebagai minimum (standar fashion brand).
     */
    async findHighEngagement(minEngagementRate = 3.0): Promise<PostAnalyticsWithDraft[]> {
        return db.postAnalytics.findMany({
            where: {
                engagementRate: { gte: minEngagementRate },
                boosted: false,
            },
            include: { contentDraft: true },
            orderBy: { engagementRate: 'desc' },
            take: 10,
        })
    },

    /**
     * Cari post yang perlu di-fetch analytics-nya.
     * Kriteria: sudah dipublish tapi belum pernah di-fetch, atau terakhir di-fetch > 24 jam lalu.
     */
    async findPublishedWithoutRecentAnalytics(): Promise<
        Array<{ id: string; instagramPostId: string; contentDraftId: string }>
    > {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

        // Draft yang sudah published tapi belum punya analytics sama sekali
        const draftsWithoutAnalytics = await db.contentDraft.findMany({
            where: {
                status: 'PUBLISHED',
                instagramPostId: { not: null },
                analytics: null,
            },
            select: { id: true, instagramPostId: true },
        })

        // Draft yang analytics-nya sudah lama tidak di-update
        const draftsWithStaleAnalytics = await db.postAnalytics.findMany({
            where: {
                fetchedAt: { lt: twentyFourHoursAgo },
            },
            select: {
                contentDraftId: true,
                instagramPostId: true,
            },
        })

        const result = [
            ...draftsWithoutAnalytics.map(d => ({
                id: d.id,
                instagramPostId: d.instagramPostId!,
                contentDraftId: d.id,
            })),
            ...draftsWithStaleAnalytics.map(a => ({
                id: a.contentDraftId,
                instagramPostId: a.instagramPostId,
                contentDraftId: a.contentDraftId,
            })),
        ]

        // Dedup berdasarkan contentDraftId
        return [...new Map(result.map(r => [r.contentDraftId, r])).values()]
    },

    async markBoosted(contentDraftId: string, adsCampaignId: string): Promise<PostAnalytics> {
        return db.postAnalytics.update({
            where: { contentDraftId },
            data: { boosted: true, adsCampaignId },
        })
    },
}
