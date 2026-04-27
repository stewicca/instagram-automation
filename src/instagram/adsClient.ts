/**
 * Fase 7: Meta Ads API Client
 *
 * Wrapper type-safe untuk Meta Marketing API v20.0.
 *
 * Hierarki objek Meta Ads:
 *   Campaign (tujuan keseluruhan: awareness, traffic, conversions)
 *     └── Ad Set (target audience + budget + jadwal)
 *           └── Ad Creative (gambar + teks iklan)
 *                 └── Ad (menghubungkan ad set + creative, punya status sendiri)
 *
 * Strategy untuk fashion brand akun baru:
 * - Objective: OUTCOME_AWARENESS (bukan conversions — akun baru butuh awareness dulu)
 * - Budget: Rp 50.000–100.000/hari (mulai kecil, scale jika ROAS bagus)
 * - Target: Indonesia, umur 25-38, interest fashion
 * - Trigger: hanya boost post organik dengan engagement > 3%
 *
 * Prerequisites:
 * - Meta Business Verification
 * - Ad Account (act_XXXXXX) dengan payment method terdaftar
 * - META_ADS_ACCESS_TOKEN dengan permission ads_management
 */
import { fetchWithRetry } from '../lib/httpClient.js'
import { logger } from '../lib/logger.js'
import { env } from '../config/env.js'
import { z } from 'zod'

const ADS_API_BASE = 'https://graph.facebook.com/v20.0'

// ─────────────────────────────────────────────────────────────────────────────
// Schemas & Types
// ─────────────────────────────────────────────────────────────────────────────

const AdsCreateResultSchema = z.object({ id: z.string() })

const AdsCampaignInsightsSchema = z.object({
    data: z.array(z.object({
        campaign_id: z.string().optional(),
        campaign_name: z.string().optional(),
        spend: z.string(),           // IDR, string dari API
        impressions: z.string(),
        reach: z.string(),
        clicks: z.string().optional(),
        cpm: z.string().optional(),  // Cost per 1000 impressions
        ctr: z.string().optional(),  // Click-through rate
        date_start: z.string(),
        date_stop: z.string(),
    }))
})

export interface CreateCampaignParams {
    name: string
    // OUTCOME_AWARENESS = jangkauan seluas mungkin
    // OUTCOME_TRAFFIC = klik ke website/profil
    objective?: 'OUTCOME_AWARENESS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT'
}

export interface CreateAdSetParams {
    campaignId: string
    name: string
    // Budget dalam Rupiah per hari (Meta menerima dalam cents IDR)
    dailyBudgetIdr: number
    targeting?: {
        ageMin?: number
        ageMax?: number
        countries?: string[]
        interestIds?: string[]  // Meta interest targeting IDs
    }
}

export interface CreateAdParams {
    adSetId: string
    name: string
    instagramPostId: string  // Boost post yang sudah ada
    instagramAccountId: string
}

export interface AdsCampaignSummary {
    campaignId: string
    adSetId: string
    adId: string
    status: 'PAUSED'  // Selalu dibuat PAUSED — butuh approval user sebelum aktif
}

export interface CampaignPerformance {
    campaignId: string
    campaignName: string
    spend: number         // IDR
    impressions: number
    reach: number
    clicks: number
    cpm: number           // Cost per 1000 impressions (IDR)
    ctr: number           // Click-through rate (%)
    roas?: number         // Return on Ad Spend (butuh conversion tracking)
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export class MetaAdsClient {
    private readonly adAccountId: string
    private readonly accessToken: string

    constructor() {
        if (!env.META_ADS_ACCOUNT_ID || !env.META_ADS_ACCESS_TOKEN) {
            throw new Error(
                'Meta Ads API tidak dikonfigurasi. ' +
                'Set META_ADS_ACCOUNT_ID dan META_ADS_ACCESS_TOKEN di .env.'
            )
        }
        this.adAccountId = env.META_ADS_ACCOUNT_ID
        this.accessToken = env.META_ADS_ACCESS_TOKEN
    }

    /**
     * Step 1: Buat Campaign (kontainer level tertinggi).
     * Dibuat dengan status PAUSED — tidak mulai beriklan sampai diaktifkan manual.
     */
    async createCampaign(params: CreateCampaignParams): Promise<string> {
        const { name, objective = 'OUTCOME_AWARENESS' } = params

        logger.info({ name, objective }, 'Creating Meta Ads campaign')

        const url = this.buildUrl(`/${this.adAccountId}/campaigns`)
        const body = this.buildBody({
            name,
            objective,
            status: 'PAUSED',            // Selalu mulai PAUSED — safety first
            special_ad_categories: [],   // Wajib ada, kosong untuk fashion
        })

        const raw = await fetchWithRetry<unknown>(url, { method: 'POST', body })
        const result = AdsCreateResultSchema.parse(raw)

        logger.info({ campaignId: result.id }, 'Campaign created')
        return result.id
    }

    /**
     * Step 2: Buat Ad Set (targeting + budget).
     * Daily budget dalam IDR (misalnya 50000 = Rp 50.000/hari).
     */
    async createAdSet(params: CreateAdSetParams): Promise<string> {
        const {
            campaignId, name, dailyBudgetIdr,
            targeting = {}
        } = params

        const {
            ageMin = 25,
            ageMax = 38,
            countries = ['ID'],
        } = targeting

        // Meta Ads API menerima budget dalam "cents" dari currency lokal
        // IDR tidak punya decimal, jadi 50000 IDR = 50000 (bukan 5000000)
        const dailyBudget = dailyBudgetIdr

        logger.info({ campaignId, name, dailyBudgetIdr }, 'Creating Meta Ads ad set')

        const url = this.buildUrl(`/${this.adAccountId}/adsets`)
        const body = this.buildBody({
            name,
            campaign_id: campaignId,
            daily_budget: dailyBudget,
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'REACH',
            status: 'PAUSED',
            targeting: JSON.stringify({
                geo_locations: { countries },
                age_min: ageMin,
                age_max: ageMax,
                // Fashion interests — IDs ini standar di Meta
                flexible_spec: [{
                    interests: [
                        { id: '6003632298235', name: 'Fashion' },
                        { id: '6003197234654', name: 'Style' },
                    ]
                }]
            }),
        })

        const raw = await fetchWithRetry<unknown>(url, { method: 'POST', body })
        const result = AdsCreateResultSchema.parse(raw)

        logger.info({ adSetId: result.id }, 'Ad set created')
        return result.id
    }

    /**
     * Step 3: Buat Ad yang menghubungkan Ad Set dengan post Instagram yang di-boost.
     * Ini yang membuat post yang sudah ada berjalan sebagai iklan.
     */
    async createAd(params: CreateAdParams): Promise<string> {
        const { adSetId, name, instagramPostId, instagramAccountId } = params

        logger.info({ adSetId, instagramPostId }, 'Creating Meta Ad (boosting Instagram post)')

        // Buat creative yang mereferensikan post Instagram yang sudah ada
        const creativeUrl = this.buildUrl(`/${this.adAccountId}/adcreatives`)
        const creativeBody = this.buildBody({
            name: `Creative for ${name}`,
            object_story_spec: JSON.stringify({
                instagram_actor_id: instagramAccountId,
                photo_data: {
                    instagram_feed_object_id: instagramPostId,
                }
            }),
        })

        const creativeRaw = await fetchWithRetry<unknown>(creativeUrl, { method: 'POST', body: creativeBody })
        const creative = AdsCreateResultSchema.parse(creativeRaw)

        // Buat Ad yang menghubungkan ad set + creative
        const adUrl = this.buildUrl(`/${this.adAccountId}/ads`)
        const adBody = this.buildBody({
            name,
            adset_id: adSetId,
            creative: JSON.stringify({ creative_id: creative.id }),
            status: 'PAUSED',
        })

        const adRaw = await fetchWithRetry<unknown>(adUrl, { method: 'POST', body: adBody })
        const ad = AdsCreateResultSchema.parse(adRaw)

        logger.info({ adId: ad.id, creativeId: creative.id }, 'Ad created')
        return ad.id
    }

    /**
     * Buat campaign lengkap (campaign + ad set + ad) dalam satu pemanggilan.
     * Semua dibuat dengan status PAUSED — user harus aktifkan manual.
     */
    async createBoostCampaign(params: {
        instagramPostId: string
        instagramAccountId: string
        postCaption: string
        dailyBudgetIdr: number
    }): Promise<AdsCampaignSummary> {
        const { instagramPostId, instagramAccountId, postCaption, dailyBudgetIdr } = params

        const campaignName = `Boost — ${postCaption.slice(0, 40).trim()}...`
        const baseName = `Post ${instagramPostId.slice(-6)}`

        const campaignId = await this.createCampaign({ name: campaignName })
        const adSetId = await this.createAdSet({
            campaignId,
            name: `Ad Set — ${baseName}`,
            dailyBudgetIdr,
        })
        const adId = await this.createAd({
            adSetId,
            name: `Ad — ${baseName}`,
            instagramPostId,
            instagramAccountId,
        })

        logger.info(
            { campaignId, adSetId, adId, instagramPostId },
            'Boost campaign created (PAUSED — awaiting approval)'
        )

        return { campaignId, adSetId, adId, status: 'PAUSED' }
    }

    /**
     * Ambil performa campaign yang sedang berjalan.
     * Gunakan ini untuk monitor ROAS dan keputusan scale/pause.
     */
    async getCampaignInsights(campaignId: string, days = 7): Promise<CampaignPerformance | null> {
        logger.info({ campaignId, days }, 'Fetching campaign insights')

        const url = this.buildUrl(`/${campaignId}/insights`, {
            fields: 'campaign_name,spend,impressions,reach,clicks,cpm,ctr',
            date_preset: `last_${days}d`,
            level: 'campaign',
        })

        const raw = await fetchWithRetry<unknown>(url)
        const result = AdsCampaignInsightsSchema.safeParse(raw)

        if (!result.success || result.data.data.length === 0) return null

        const d = result.data.data[0]!
        return {
            campaignId,
            campaignName: d.campaign_name ?? campaignId,
            spend: parseFloat(d.spend),
            impressions: parseInt(d.impressions, 10),
            reach: parseInt(d.reach, 10),
            clicks: parseInt(d.clicks ?? '0', 10),
            cpm: parseFloat(d.cpm ?? '0'),
            ctr: parseFloat(d.ctr ?? '0'),
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private buildUrl(path: string, params: Record<string, string> = {}): string {
        const url = new URL(`${ADS_API_BASE}${path}`)
        url.searchParams.set('access_token', this.accessToken)
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value)
        }
        return url.toString()
    }

    private buildBody(data: Record<string, unknown>): URLSearchParams {
        const body = new URLSearchParams()
        body.set('access_token', this.accessToken)
        for (const [key, value] of Object.entries(data)) {
            body.set(key, String(value))
        }
        return body
    }
}

export function createAdsClient(): MetaAdsClient {
    return new MetaAdsClient()
}
