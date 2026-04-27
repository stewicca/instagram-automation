/**
 * Fase 5: Instagram Graph API Client
 *
 * Type-safe wrapper untuk Instagram Graph API v21.0.
 *
 * Cara kerja publishing (2 tahap — ini yang bikin banyak developer bingung):
 *   1. Buat media container → Meta proses gambar di servernya
 *   2. Setelah container FINISHED → publish → dapat post ID
 *
 * Kenapa 2 tahap? Karena Meta harus resize, compress, dan validasi gambar
 * sebelum publish. Proses ini bisa butuh 1-30 detik.
 *
 * Prerequisites untuk bisa test:
 *   - Instagram Business atau Creator account
 *   - Meta App dengan permission: instagram_basic, instagram_content_publish, instagram_manage_insights
 *   - Long-lived access token (valid 60 hari, harus di-refresh sebelum expired)
 *   - Image URL harus publik (tidak bisa localhost)
 */
import { env } from '../config/env.js'
import { fetchWithRetry } from '../lib/httpClient.js'
import { logger } from '../lib/logger.js'
import { withRetry } from '../lib/retry.js'
import {
    IGProfileSchema,
    IGMediaListSchema,
    IGContainerStatusSchema,
    IGPublishResultSchema,
    IGInsightsResponseSchema,
    MetaErrorResponseSchema,
    InstagramApiError,
    type IGProfile,
    type IGMediaList,
    type IGUploadPhotoParams,
    type IGSchedulePostParams,
    type IGPublishedPost,
    type IGPostInsights,
    type IGTokenStatus,
} from './types.js'

const BASE_URL = 'https://graph.instagram.com/v21.0'

const MEDIA_FIELDS = [
    'id',
    'caption',
    'media_type',
    'media_url',
    'permalink',
    'timestamp',
    'like_count',
    'comments_count',
].join(',')

const PROFILE_FIELDS = [
    'id',
    'username',
    'name',
    'biography',
    'followers_count',
    'media_count',
    'profile_picture_url',
].join(',')

// Metrik yang tersedia di Insights API
const INSIGHTS_METRICS = [
    'impressions',
    'reach',
    'likes',
    'comments',
    'saved',  // API pakai "saved", bukan "saves"
    'shares',
].join(',')

const CONTAINER_POLL_INTERVAL_MS = 3_000
const CONTAINER_POLL_MAX_ATTEMPTS = 20 // max ~60 detik

export class InstagramClient {
    private readonly accountId: string
    private readonly accessToken: string

    constructor() {
        this.accountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID
        this.accessToken = env.INSTAGRAM_ACCESS_TOKEN
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read Operations
    // ─────────────────────────────────────────────────────────────────────────

    async getProfile(): Promise<IGProfile> {
        logger.info({ accountId: this.accountId }, 'Fetching Instagram profile')

        const url = this.buildUrl(`/${this.accountId}`, { fields: PROFILE_FIELDS })
        const raw = await this.get<unknown>(url)

        const result = IGProfileSchema.safeParse(raw)
        if (!result.success) {
            logger.error({ error: result.error.flatten() }, 'Invalid profile response from Instagram')
            throw new Error('Instagram API returned unexpected profile shape')
        }

        return result.data
    }

    async getRecentMedia(limit = 20): Promise<IGMediaList> {
        logger.info({ accountId: this.accountId, limit }, 'Fetching recent media')

        const url = this.buildUrl(`/${this.accountId}/media`, {
            fields: MEDIA_FIELDS,
            limit: String(limit),
        })

        const raw = await this.get<unknown>(url)

        const result = IGMediaListSchema.safeParse(raw)
        if (!result.success) {
            logger.error({ error: result.error.flatten() }, 'Invalid media list response')
            throw new Error('Instagram API returned unexpected media shape')
        }

        return result.data
    }

    /**
     * Fetch Insights untuk satu post yang sudah dipublish.
     *
     * Catatan:
     * - Data tersedia ~2 jam setelah publish
     * - Butuh permission: instagram_manage_insights
     * - Akun harus Business atau Creator (bukan Personal)
     */
    async fetchPostInsights(instagramPostId: string): Promise<IGPostInsights> {
        logger.info({ instagramPostId }, 'Fetching post insights')

        const url = this.buildUrl(`/${instagramPostId}/insights`, {
            metric: INSIGHTS_METRICS,
            period: 'lifetime',
        })

        const raw = await this.get<unknown>(url)

        const result = IGInsightsResponseSchema.safeParse(raw)
        if (!result.success) {
            logger.error({ error: result.error.flatten() }, 'Invalid insights response')
            throw new Error('Instagram Insights API returned unexpected shape')
        }

        // Flatten metrics array → object yang mudah dipakai
        const metrics: Record<string, number> = {}
        for (const metric of result.data.data) {
            const value = metric.values[0]?.value ?? 0
            metrics[metric.name] = typeof value === 'number' ? value : 0
        }

        const likes = metrics.likes ?? 0
        const comments = metrics.comments ?? 0
        const saves = metrics.saved ?? 0
        const shares = metrics.shares ?? 0
        const reach = metrics.reach ?? 0

        const engagementRate = reach > 0
            ? ((likes + comments + saves + shares) / reach) * 100
            : 0

        logger.info(
            { instagramPostId, reach, engagementRate: engagementRate.toFixed(2) + '%' },
            'Insights fetched'
        )

        return {
            impressions: metrics.impressions ?? 0,
            reach,
            likes,
            comments,
            saves,
            shares,
            engagementRate: parseFloat(engagementRate.toFixed(4)),
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Publishing — 2-step process
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Publish foto ke Instagram (flow sungguhan, bukan mock).
     *
     * Internal flow:
     *   1. createMediaContainer() — kirim imageUrl ke Meta
     *   2. pollContainerUntilFinished() — tunggu Meta proses gambar
     *   3. publishContainer() — post live
     *   4. getMediaPermalink() — ambil URL post
     */
    async publishPhoto(params: IGUploadPhotoParams): Promise<IGPublishedPost> {
        logger.info({ imageUrl: params.imageUrl }, 'Starting Instagram publish (2-step flow)')

        const containerId = await this.createMediaContainer({
            image_url: params.imageUrl,
            caption: params.caption,
        })

        logger.info({ containerId }, 'Container created — polling for FINISHED status')

        await this.pollContainerUntilFinished(containerId)

        const postId = await this.publishContainer(containerId)
        const permalink = await this.getMediaPermalink(postId)

        logger.info({ postId, permalink }, 'Photo published to Instagram')

        return { postId, permalink, containerId }
    }

    /**
     * Schedule post untuk dipublish di waktu tertentu.
     * Minimal 10 menit dari sekarang, maksimal 75 hari ke depan.
     */
    async schedulePost(params: IGSchedulePostParams): Promise<{ containerId: string }> {
        const minutesFromNow = (params.scheduledAt.getTime() - Date.now()) / 60_000

        if (minutesFromNow < 10) {
            throw new Error('Scheduled time must be at least 10 minutes from now')
        }
        if (minutesFromNow > 75 * 24 * 60) {
            throw new Error('Scheduled time cannot be more than 75 days from now')
        }

        logger.info({ scheduledAt: params.scheduledAt.toISOString() }, 'Scheduling Instagram post')

        const containerId = await this.createMediaContainer({
            image_url: params.imageUrl,
            caption: params.caption,
            published: 'false',
            scheduled_publish_time: String(Math.floor(params.scheduledAt.getTime() / 1000)),
        })

        logger.info({ containerId, scheduledAt: params.scheduledAt.toISOString() }, 'Post scheduled')

        return { containerId }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token Validation
    //
    // Long-lived token berlaku 60 hari.
    // Warning jika sisa < 7 hari.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Validasi apakah access token masih berlaku.
     * Panggil ini saat startup untuk early warning sebelum token expired.
     */
    async validateToken(): Promise<IGTokenStatus> {
        logger.info('Validating Instagram access token')

        try {
            // Cara paling sederhana: coba fetch profile — kalau gagal, token invalid
            const url = this.buildUrl(`/${this.accountId}`, { fields: 'id' })
            await this.get<unknown>(url)

            logger.info('Access token is valid')
            return { valid: true }
        } catch (error) {
            if (error instanceof InstagramApiError && error.isTokenError()) {
                logger.error('⚠️  Access token INVALID or EXPIRED — update INSTAGRAM_ACCESS_TOKEN')
                return { valid: false }
            }
            throw error
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private async createMediaContainer(params: Record<string, string>): Promise<string> {
        const url = this.buildUrl(`/${this.accountId}/media`)

        const body = new URLSearchParams({
            access_token: this.accessToken,
            ...params,
        })

        const raw = await fetchWithRetry<unknown>(url, {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })

        const result = IGPublishResultSchema.safeParse(raw)
        if (!result.success) {
            throw new Error('Failed to create media container: unexpected response shape')
        }

        return result.data.id
    }

    private async pollContainerUntilFinished(containerId: string): Promise<void> {
        for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
            await new Promise(r => setTimeout(r, CONTAINER_POLL_INTERVAL_MS))

            const url = this.buildUrl(`/${containerId}`, { fields: 'status_code,error_message' })
            const raw = await this.get<unknown>(url)

            const result = IGContainerStatusSchema.safeParse(raw)
            if (!result.success) throw new Error('Unexpected container status response')

            const { status_code, error_message } = result.data

            logger.debug({ containerId, status_code, attempt: attempt + 1 }, 'Container poll')

            if (status_code === 'FINISHED') return

            if (status_code === 'ERROR') {
                throw new Error(`Media container processing failed: ${error_message ?? 'unknown'}`)
            }

            if (status_code === 'EXPIRED') {
                throw new Error('Media container expired — must publish within 24 hours of creation')
            }
        }

        const totalSec = (CONTAINER_POLL_MAX_ATTEMPTS * CONTAINER_POLL_INTERVAL_MS) / 1000
        throw new Error(`Container not ready after ${totalSec}s — check image URL accessibility`)
    }

    private async publishContainer(containerId: string): Promise<string> {
        const url = this.buildUrl(`/${this.accountId}/media_publish`)

        const body = new URLSearchParams({
            access_token: this.accessToken,
            creation_id: containerId,
        })

        const raw = await fetchWithRetry<unknown>(url, {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })

        const result = IGPublishResultSchema.safeParse(raw)
        if (!result.success) {
            throw new Error('Failed to publish container: unexpected response shape')
        }

        return result.data.id
    }

    private async getMediaPermalink(mediaId: string): Promise<string> {
        const url = this.buildUrl(`/${mediaId}`, { fields: 'permalink' })
        const raw = await this.get<{ permalink?: string }>(url)
        return raw.permalink ?? `https://www.instagram.com/p/${mediaId}/`
    }

    /**
     * GET request dengan Meta-specific error parsing.
     *
     * Meta API kadang return 200 OK tapi body-nya berisi error object.
     * Dan kadang return 4xx dengan error di body JSON.
     * Kita normalize semuanya jadi InstagramApiError.
     */
    private async get<T>(url: string): Promise<T> {
        return withRetry(
            async () => {
                try {
                    const raw = await fetchWithRetry<unknown>(url)

                    // Cek apakah response berisi error walau HTTP 200
                    const maybeError = MetaErrorResponseSchema.safeParse(raw)
                    if (maybeError.success) {
                        const { code, error_subcode, message, fbtrace_id } = maybeError.data.error
                        throw new InstagramApiError(message, code, error_subcode, fbtrace_id)
                    }

                    return raw as T
                } catch (error) {
                    if (error instanceof InstagramApiError) throw error
                    throw this.parseMetaError(error)
                }
            },
            {
                maxAttempts: 3,
                baseDelayMs: 1000,
                shouldRetry: (err) => err instanceof InstagramApiError && err.isRetryable(),
                onRetry: (attempt, err) => {
                    const msg = err instanceof Error ? err.message : 'unknown'
                    logger.warn({ attempt, error: msg }, 'Retrying Instagram API call')
                },
            }
        )
    }

    private buildUrl(path: string, params: Record<string, string> = {}): string {
        const url = new URL(`${BASE_URL}${path}`)
        url.searchParams.set('access_token', this.accessToken)
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }
        return url.toString()
    }

    private parseMetaError(error: unknown): Error {
        if (!(error instanceof Error)) return new Error(String(error))

        try {
            const body = JSON.parse(error.message)
            const parsed = MetaErrorResponseSchema.safeParse(body)
            if (parsed.success) {
                const { code, error_subcode, message, fbtrace_id } = parsed.data.error
                return new InstagramApiError(message, code, error_subcode, fbtrace_id)
            }
        } catch {
            // bukan JSON — kembalikan error asli
        }

        return error
    }
}

export function createInstagramClient(): InstagramClient {
    return new InstagramClient()
}
