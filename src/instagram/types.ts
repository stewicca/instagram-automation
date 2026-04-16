import { z } from 'zod'

export const IGMediaSchema = z.object({
    id: z.string(),
    caption: z.string().optional(),
    media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']),
    media_url: z.string().url(),
    permalink: z.string().url(),
    timestamp: z.string().datetime(),
    like_count: z.number().int().nonnegative().optional(),
    comments_count: z.number().int().nonnegative().optional(),
})

export const IGMediaListSchema = z.object({
    data: z.array(IGMediaSchema),
    paging: z.object({
        cursors: z.object({
            before: z.string(),
            after: z.string(),
        }).optional(),
        next: z.string().url().optional(),
    }).optional(),
})

export const IGProfileSchema = z.object({
    id: z.string(),
    username: z.string(),
    name: z.string().optional(),
    biography: z.string().optional(),
    followers_count: z.number().int().nonnegative(),
    media_count: z.number().int().nonnegative(),
    profile_picture_url: z.string().url().optional(),
    website: z.string().url().optional(),
})

export type IGMedia = z.infer<typeof IGMediaSchema>
export type IGMediaList = z.infer<typeof IGMediaListSchema>
export type IGProfile = z.infer<typeof IGProfileSchema>

export const ContentDraftSchema = z.object({
    id: z.string().min(1),
    caption: z.string().max(2200),
    hashtags: z.array(z.string()).max(30),
    imageUrl: z.string().url(),
    imagePrompt: z.string(),
    status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED']),
    feedback: z.string().default(''),
    createdAt: z.date(),
    publishedAt: z.date().nullable(),
    scheduledFor: z.date(),
})

export type ContentDraft = z.infer<typeof ContentDraftSchema>
