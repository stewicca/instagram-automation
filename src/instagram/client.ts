import { env } from '../config/env.js'
import { fetchWithRetry } from '../lib/httpClient.js'
import { logger } from '../lib/logger.js'
import {
    IGProfileSchema,
    IGMediaListSchema,
    type IGProfile,
    type IGMediaList,
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
].join('.')

const PROFILE_FIELDS = [
    'id',
    'username',
    'name',
    'biography',
    'followers_count',
    'media_count',
    'profile_picture_url',
].join(',')

export class InstagramClient {
    private readonly accountId: string
    private readonly accessToken: string

    constructor() {
        this.accountId = env.INSTAGRAM_BUSINESS_ACCOUNT_ID
        this.accessToken = env.INSTAGRAM_ACCESS_TOKEN
    }

    private buildUrl(path: string, params: Record<string, string> = {}): string {
        const url = new URL(`${BASE_URL}${path}`)
        url.searchParams.set('access_token', this.accessToken)
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }
        return url.toString()
    }

    async getProfile(): Promise<IGProfile> {
        logger.info({ accountId: this.accountId }, 'Fetching Instagram profile')

        const url = this.buildUrl(`/${this.accountId}`, { fields: PROFILE_FIELDS })
        const raw = await fetchWithRetry<unknown>(url)

        const result = IGProfileSchema.safeParse(raw)
        if (!result.success) {
            logger.error({ error: result.error.flatten() }, 'Invalid profile response from Intagram')
            throw new Error('Intagram API returned unexpected profile shape')
        }

        return result.data
    }

    async getRecentMedia(limit = 10): Promise<IGMediaList> {
        logger.info({ accountId: this.accountId, limit }, 'Fetching recent media')

        const url = this.buildUrl(`/${this.accountId}/media`, {
            fields: MEDIA_FIELDS,
            limit: String(limit),
        })

        const raw = await fetchWithRetry<unknown>(url)

        const result = IGMediaListSchema.safeParse(raw)
        if (!result.success) {
            logger.error({ error: result.error.flatten() }, 'Invalid media list response')
            throw new Error('Instagram API returned unexpected media shape')
        }

        return result.data
    }
}
