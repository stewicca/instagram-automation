/**
 * Fase 5: Instagram Graph API — Type Definitions
 *
 * Semua type di-validasi dengan Zod saat runtime.
 * Jika Meta mengubah response shape, Zod langsung error dengan pesan jelas
 * daripada silent failure dengan undefined fields.
 */
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Media & Profile
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Media Container — upload flow step 1 & 2
//
// Instagram publishing adalah proses 2 langkah:
//   Step 1: Buat container (POST /me/media) → dapat container ID
//   Step 2: Publish container (POST /me/media_publish) → dapat post ID
//
// Di antara keduanya, perlu poll status container sampai FINISHED.
// Container yang tidak dipublish dalam 24 jam akan EXPIRED otomatis.
// ─────────────────────────────────────────────────────────────────────────────

export const IGContainerStatusSchema = z.object({
    id: z.string(),
    status_code: z.enum(['EXPIRED', 'ERROR', 'FINISHED', 'IN_PROGRESS', 'PUBLISHED']),
    error_message: z.string().optional(),
})

export const IGPublishResultSchema = z.object({
    id: z.string(), // Instagram media/post ID
})

export type IGContainerStatus = z.infer<typeof IGContainerStatusSchema>
export type IGPublishResult = z.infer<typeof IGPublishResultSchema>

export interface IGUploadPhotoParams {
    // URL gambar yang bisa diakses publik oleh Meta server
    // Tidak bisa localhost — harus bisa di-fetch dari internet
    imageUrl: string
    // Caption gabungan: teks + hashtag (maks 2200 karakter, maks 30 hashtag)
    caption: string
}

export interface IGSchedulePostParams extends IGUploadPhotoParams {
    // Minimal 10 menit dari sekarang, maksimal 75 hari ke depan
    scheduledAt: Date
}

export interface IGPublishedPost {
    postId: string        // Instagram media ID
    permalink: string     // URL post yang bisa dibuka
    containerId: string   // Container ID — untuk audit trail
}

// ─────────────────────────────────────────────────────────────────────────────
// Insights API
//
// Hanya tersedia untuk Business/Creator accounts.
// Data baru tersedia ~2 jam setelah post dipublish.
// ─────────────────────────────────────────────────────────────────────────────

export const IGInsightsMetricSchema = z.object({
    id: z.string(),
    name: z.string(),
    period: z.string(),
    values: z.array(z.object({
        value: z.number(),
        end_time: z.string().optional(),
    })),
})

export const IGInsightsResponseSchema = z.object({
    data: z.array(IGInsightsMetricSchema),
})

export interface IGPostInsights {
    impressions: number
    reach: number
    likes: number
    comments: number
    saves: number
    shares: number
    // (likes + comments + saves + shares) / reach * 100
    engagementRate: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Validation
//
// Long-lived token berlaku 60 hari.
// Perlu di-refresh sebelum expired: GET /oauth/access_token
// ─────────────────────────────────────────────────────────────────────────────

export const IGTokenInfoSchema = z.object({
    data: z.object({
        is_valid: z.boolean(),
        expires_at: z.number().optional(),
        scopes: z.array(z.string()).optional(),
        app_id: z.string().optional(),
        user_id: z.string().optional(),
    }),
})

export interface IGTokenStatus {
    valid: boolean
    expiresAt?: Date
    daysUntilExpiry?: number
    scopes?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta API Error Handling
//
// Meta menggunakan kode error numerik yang spesifik.
// Penting untuk membedakan: rate limit vs token expire vs permission vs server error
// karena cara handle-nya berbeda.
// ─────────────────────────────────────────────────────────────────────────────

export const META_ERROR_CODES = {
    INVALID_TOKEN: 190,         // Token expired atau invalid
    RATE_LIMIT: 32,             // App-level rate limit
    USER_RATE_LIMIT: 17,        // User-level rate limit
    API_CALLS_RATE_LIMIT: 4,    // API call rate limit
    PERMISSION_ERROR: 200,      // Missing permission scope
    TEMPORARY_ERROR: 2,         // Meta server error (retry-able)
    SERVICE_UNAVAILABLE: 803,   // Service down (retry-able)
} as const

export class InstagramApiError extends Error {
    constructor(
        message: string,
        public readonly code: number,
        public readonly subcode?: number,
        public readonly traceId?: string
    ) {
        super(message)
        this.name = 'InstagramApiError'
    }

    isRateLimit(): boolean {
        return (
            this.code === META_ERROR_CODES.RATE_LIMIT ||
            this.code === META_ERROR_CODES.USER_RATE_LIMIT ||
            this.code === META_ERROR_CODES.API_CALLS_RATE_LIMIT
        )
    }

    isTokenError(): boolean {
        return this.code === META_ERROR_CODES.INVALID_TOKEN
    }

    isRetryable(): boolean {
        return (
            this.isRateLimit() ||
            this.code === META_ERROR_CODES.TEMPORARY_ERROR ||
            this.code === META_ERROR_CODES.SERVICE_UNAVAILABLE
        )
    }
}

export const MetaErrorResponseSchema = z.object({
    error: z.object({
        message: z.string(),
        type: z.string().optional(),
        code: z.number(),
        error_subcode: z.number().optional(),
        fbtrace_id: z.string().optional(),
    }),
})
