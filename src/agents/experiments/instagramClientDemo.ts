/**
 * Fase 5: Instagram Graph API — Demo
 *
 * Jalankan: npx tsx src/agents/experiments/instagramClientDemo.ts
 *
 * Yang kamu pelajari:
 * 1. Instagram 2-step publishing flow (container → publish)
 * 2. Insights API dan cara hitung engagement rate
 * 3. Token validation dan handling expired token
 * 4. Meta API error codes dan cara handle dengan tepat
 * 5. Rate limiting di Instagram (25 posts per 24 jam)
 *
 * Mode:
 *   DRY_RUN=true (default)  → tampilkan request tanpa hit API sungguhan
 *   DRY_RUN=false           → hit Instagram API (butuh credentials valid)
 *
 * Prerequisites untuk mode live:
 *   1. Instagram Business/Creator account
 *   2. Meta App dengan permissions: instagram_basic, instagram_content_publish, instagram_manage_insights
 *   3. Long-lived access token (berlaku 60 hari)
 *   4. Set di .env: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID
 *   5. Image URL harus bisa diakses publik (bukan localhost)
 */
import { createInstagramClient } from '../../instagram/client.js'
import { InstagramApiError, META_ERROR_CODES } from '../../instagram/types.js'
import { env } from '../../config/env.js'

const DRY_RUN = process.env.DRY_RUN !== 'false'

// ─────────────────────────────────────────────────────────────────────────────
// Demo 1: Token Validation
// ─────────────────────────────────────────────────────────────────────────────

async function demo1TokenValidation(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 1: Token Validation')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nKenapa token management penting:')
    console.log('  • Long-lived token berlaku 60 hari saja')
    console.log('  • Jika expired → semua API call gagal dengan error 190')
    console.log('  • Perlu di-refresh sebelum expired (GET /oauth/access_token)')
    console.log('  • Production: cek sisa hari setiap startup, alert jika < 7 hari')

    if (DRY_RUN) {
        console.log('\n[DRY RUN] Token validation tidak dijalankan')
        console.log('  Untuk test: DRY_RUN=false npx tsx instagramClientDemo.ts')
        return
    }

    const client = createInstagramClient()
    const status = await client.validateToken()

    if (status.valid) {
        console.log('✅ Token valid')
        if (status.daysUntilExpiry !== undefined) {
            console.log(`   Expires in: ${status.daysUntilExpiry} days`)
            if (status.daysUntilExpiry < 7) {
                console.log('   ⚠️  WARNING: Token expires soon — refresh now!')
            }
        }
    } else {
        console.log('❌ Token INVALID or EXPIRED')
        console.log('   Update INSTAGRAM_ACCESS_TOKEN di .env')
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 2: Publishing Flow (2-step)
// ─────────────────────────────────────────────────────────────────────────────

async function demo2PublishingFlow(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 2: Instagram Publishing Flow (2 Tahap)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const exampleCaption = [
        'Koleksi batik modern untuk hari kerja. ✨',
        '',
        'Setiap helai kain menceritakan perjalanan pengrajin lokal yang penuh dedikasi.',
        'Bangga pakai buatan Indonesia.',
        '',
        '#BatikModern #FashionLokal #NusantaraWear #BanggaLokal',
    ].join('\n')

    const exampleImageUrl = 'https://example.com/batik-modern.jpg'

    console.log('\nFlow yang diimplementasikan di InstagramClient.publishPhoto():')
    console.log()
    console.log('  Step 1: POST /{accountId}/media')
    console.log(`    image_url: "${exampleImageUrl}"`)
    console.log(`    caption: "${exampleCaption.slice(0, 50)}..."`)
    console.log('    → Response: { id: "container_id_xxx" }')
    console.log()
    console.log('  Step 1.5: Poll GET /{container_id}?fields=status_code')
    console.log('    status_code: IN_PROGRESS → IN_PROGRESS → FINISHED')
    console.log('    (setiap 3 detik, maksimal 60 detik)')
    console.log()
    console.log('  Step 2: POST /{accountId}/media_publish')
    console.log('    creation_id: "container_id_xxx"')
    console.log('    → Response: { id: "instagram_post_id_xxx" }')
    console.log()
    console.log('  Step 3: GET /{post_id}?fields=permalink')
    console.log('    → Response: { permalink: "https://www.instagram.com/p/xxx/" }')

    if (DRY_RUN) {
        console.log('\n[DRY RUN] Tidak benar-benar publish ke Instagram')
        console.log('Untuk publish sungguhan: DRY_RUN=false npx tsx instagramClientDemo.ts')
        return
    }

    const client = createInstagramClient()

    try {
        console.log('\nMemulai publish...')
        const result = await client.publishPhoto({
            imageUrl: exampleImageUrl,
            caption: exampleCaption,
        })

        console.log('\n✅ Published!')
        console.log(`   Post ID  : ${result.postId}`)
        console.log(`   Permalink: ${result.permalink}`)
        console.log(`   Container: ${result.containerId}`)
    } catch (err) {
        handleInstagramError(err)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 3: Scheduled Post
// ─────────────────────────────────────────────────────────────────────────────

async function demo3ScheduledPost(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 3: Schedule Post untuk Jam Optimal')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Jam optimal posting untuk fashion Indonesia: 19:00-21:00 WIB
    const scheduledAt = new Date()
    scheduledAt.setHours(19, 0, 0, 0) // Jam 19:00 hari ini
    if (scheduledAt < new Date()) {
        scheduledAt.setDate(scheduledAt.getDate() + 1) // Besok jika sudah lewat
    }

    console.log(`\nSchedule untuk: ${scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`)
    console.log()
    console.log('Perbedaan scheduled vs immediate publish:')
    console.log('  • Container dibuat dengan published: "false"')
    console.log('  • scheduled_publish_time: Unix timestamp')
    console.log('  • Meta auto-publish di waktu tersebut')
    console.log('  • Constraints: min 10 menit, max 75 hari dari sekarang')

    if (DRY_RUN) {
        console.log('\n[DRY RUN] Tidak benar-benar schedule post')
        return
    }

    const client = createInstagramClient()

    try {
        const result = await client.schedulePost({
            imageUrl: 'https://example.com/batik.jpg',
            caption: 'Post terjadwal untuk jam prime time! #NusantaraWear',
            scheduledAt,
        })

        console.log('\n✅ Post dijadwalkan!')
        console.log(`   Container ID: ${result.containerId}`)
        console.log(`   Akan live pada: ${scheduledAt.toISOString()}`)
    } catch (err) {
        handleInstagramError(err)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 4: Insights API
// ─────────────────────────────────────────────────────────────────────────────

async function demo4Insights(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 4: Insights API — Metrics per Post')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nMetrik yang di-fetch:')
    console.log('  impressions   — berapa kali konten muncul di layar (termasuk repeat)')
    console.log('  reach         — berapa akun unik yang melihat konten')
    console.log('  likes         — jumlah like')
    console.log('  comments      — jumlah komentar')
    console.log('  saves         — disimpan ke collection')
    console.log('  shares        — di-share ke DM/story')
    console.log()
    console.log('Engagement Rate = (likes + comments + saves + shares) / reach × 100')
    console.log('Benchmark fashion Indonesia: > 3% = bagus, > 5% = sangat bagus')

    // Simulasi data nyata
    const mockInsights = {
        impressions: 1250,
        reach: 980,
        likes: 87,
        comments: 12,
        saves: 34,
        shares: 8,
        engagementRate: parseFloat(((87 + 12 + 34 + 8) / 980 * 100).toFixed(4)),
    }

    console.log('\nContoh output dari fetchPostInsights():')
    console.log(JSON.stringify(mockInsights, null, 2))

    const isHighEngagement = mockInsights.engagementRate >= 3.0
    console.log(`\nEngagement rate: ${mockInsights.engagementRate.toFixed(2)}%`)
    console.log(isHighEngagement
        ? '✅ High engagement — kandidat untuk di-boost (Fase 7: Meta Ads)'
        : '📊 Normal engagement'
    )

    if (!DRY_RUN) {
        // Fetch insights dari post nyata (butuh post ID yang valid)
        const postId = process.env.DEMO_INSTAGRAM_POST_ID
        if (postId) {
            const client = createInstagramClient()
            try {
                const real = await client.fetchPostInsights(postId)
                console.log('\nReal insights dari Instagram:')
                console.log(JSON.stringify(real, null, 2))
            } catch (err) {
                handleInstagramError(err)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo 5: Error Handling
// ─────────────────────────────────────────────────────────────────────────────

async function demo5ErrorHandling(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 5: Meta API Error Handling')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nMeta Error Codes yang penting diketahui:')
    console.log()

    const errors = [
        {
            code: META_ERROR_CODES.INVALID_TOKEN,
            name: 'INVALID_TOKEN',
            message: 'Invalid OAuth access token',
            action: '→ Update INSTAGRAM_ACCESS_TOKEN di env',
        },
        {
            code: META_ERROR_CODES.RATE_LIMIT,
            name: 'RATE_LIMIT',
            message: 'Application request limit reached',
            action: '→ Tunggu 1 jam sebelum retry. Max 200 req/jam',
        },
        {
            code: META_ERROR_CODES.USER_RATE_LIMIT,
            name: 'USER_RATE_LIMIT',
            message: 'User request limit reached',
            action: '→ Max 25 posts per 24 jam per akun',
        },
        {
            code: META_ERROR_CODES.PERMISSION_ERROR,
            name: 'PERMISSION_ERROR',
            message: 'Permission denied',
            action: '→ Tambahkan permission di Meta App Dashboard',
        },
        {
            code: META_ERROR_CODES.TEMPORARY_ERROR,
            name: 'TEMPORARY_ERROR',
            message: 'Temporary issue',
            action: '→ Retry otomatis (isRetryable() = true)',
        },
    ]

    for (const e of errors) {
        const err = new InstagramApiError(e.message, e.code)
        console.log(`  Code ${e.code} — ${e.name}`)
        console.log(`    isRateLimit: ${err.isRateLimit()}  |  isTokenError: ${err.isTokenError()}  |  isRetryable: ${err.isRetryable()}`)
        console.log(`    ${e.action}`)
        console.log()
    }

    console.log('Dalam InstagramClient.get() — error handling:')
    console.log('  1. shouldRetry: (err) => err instanceof InstagramApiError && err.isRetryable()')
    console.log('  2. Token errors langsung throw — tidak ada gunanya retry')
    console.log('  3. Rate limits retry dengan exponential backoff')
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function handleInstagramError(err: unknown): void {
    if (err instanceof InstagramApiError) {
        console.error(`\n✗ Instagram API Error:`)
        console.error(`   Message : ${err.message}`)
        console.error(`   Code    : ${err.code}`)
        if (err.subcode) console.error(`   Subcode : ${err.subcode}`)
        console.error(`   Token?  : ${err.isTokenError()}`)
        console.error(`   Rate?   : ${err.isRateLimit()}`)
        console.error(`   Retry?  : ${err.isRetryable()}`)
    } else {
        console.error(`\n✗ Error: ${err instanceof Error ? err.message : err}`)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('╔════════════════════════════════════════════════════╗')
    console.log('║  Fase 5: Instagram Graph API Demo                   ║')
    console.log('╚════════════════════════════════════════════════════╝')
    console.log()
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no real API calls)' : '🔴 LIVE (hitting real Instagram API)'}`)
    console.log(`Account: ${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}`)

    await demo1TokenValidation()
    await demo2PublishingFlow()
    await demo3ScheduledPost()
    await demo4Insights()
    await demo5ErrorHandling()

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Demo selesai!')
    console.log()
    console.log('Key Takeaways — Fase 5:')
    console.log('  1. Instagram publishing = 2 tahap (container → publish)')
    console.log('     Kenapa: Meta perlu proses/validasi gambar dulu')
    console.log('  2. Insights API butuh ~2 jam setelah publish')
    console.log('     Strategi: schedule fetchAnalytics job 24 jam ke depan')
    console.log('  3. Token management kritis — 60 hari validity')
    console.log('     Strategy: cek di startup, alert 7 hari sebelum expire')
    console.log('  4. Rate limit: 25 posts/24 jam, 200 req/jam')
    console.log('     Concurrency publishPost worker = 1 untuk avoid rate limit')
    console.log('  5. Error codes Meta berbeda-beda — classify dulu sebelum handle')
    console.log()
    console.log('Selanjutnya → Fase 6: AI Image Generation')
    console.log('  Google Gemini → generate gambar → Sharp resize → watermark → cloud upload')
}

main().catch(err => {
    console.error('Demo error:', err)
    process.exit(1)
})
