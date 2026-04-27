/**
 * Fase 7: Meta Ads Demo
 *
 * Jalankan: npx tsx src/agents/experiments/adsDemo.ts
 *
 * Yang kamu pelajari:
 * 1. Hierarki Meta Ads: Campaign → Ad Set → Ad
 * 2. Ads Analyst Agent: LLM menganalisis performa dan merekomendasikan action
 * 3. Keputusan SCALE/CONTINUE/PAUSE/BOOST_NEW berdasarkan data nyata
 * 4. Safety pattern: semua campaign dibuat PAUSED
 *
 * Prerequisites:
 *   ANTHROPIC_API_KEY=sk-ant-... (atau USE_LOCAL_LLM=true)
 *   META_ADS_ACCOUNT_ID=act_... (optional — demo bisa jalan tanpa ini)
 *   META_ADS_ACCESS_TOKEN=... (optional)
 */
import { runAdsAnalystAgent } from '../specialists/adsAnalystAgent.js'
import { env } from '../../config/env.js'

const HAS_ADS = Boolean(env.META_ADS_ACCOUNT_ID && env.META_ADS_ACCESS_TOKEN)

async function demo1AdsAnalystHighEngagement(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 1: Ads Analyst — Post Engagement Tinggi (belum di-boost)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nScenario: Post batik mendapat 4.2% engagement, 850 reach organik.')
    console.log('Apakah worth di-boost?\n')

    const rec = await runAdsAnalystAgent({
        postEngagementRate: 4.2,
        postReach: 850,
    })

    console.log('Rekomendasi LLM:')
    console.log(`  Action   : ${rec.action}`)
    console.log(`  Urgency  : ${rec.urgency}`)
    console.log(`  Summary  : ${rec.summary}`)
    console.log(`  Reasoning: ${rec.reasoning}`)
    if (rec.suggestedDailyBudgetIdr) {
        console.log(`  Budget   : Rp ${rec.suggestedDailyBudgetIdr.toLocaleString()}/hari`)
    }
}

async function demo2AdsAnalystActiveCampaign(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 2: Ads Analyst — Campaign Aktif (perlu SCALE?)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nScenario: Campaign sudah berjalan 7 hari, CPM rendah, engagement oke.')
    console.log('Apakah harus dinaikkan budget-nya?\n')

    const rec = await runAdsAnalystAgent({
        postEngagementRate: 3.8,
        postReach: 1200,
        campaign: {
            campaignId: 'mock-campaign-123',
            campaignName: 'Boost — Batik Kemeja Slim Fit...',
            spend: 280_000,        // Rp 280.000 dalam 7 hari
            impressions: 18_500,
            reach: 14_200,
            clicks: 420,
            cpm: 15_135,           // Rp 15.135 per 1000 impresi
            ctr: 2.27,
        },
        currentDailyBudgetIdr: 50_000,
    })

    console.log('Rekomendasi LLM:')
    console.log(`  Action   : ${rec.action}`)
    console.log(`  Urgency  : ${rec.urgency}`)
    console.log(`  Summary  : ${rec.summary}`)
    console.log(`  Reasoning: ${rec.reasoning}`)
    if (rec.suggestedDailyBudgetIdr) {
        console.log(`  Budget baru: Rp ${rec.suggestedDailyBudgetIdr.toLocaleString()}/hari`)
    }
}

async function demo3AdsAnalystPoorPerformance(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 3: Ads Analyst — Campaign Performa Buruk (PAUSE?)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nScenario: Campaign sudah spend Rp 150K tapi CTR sangat rendah.')
    console.log('Haruskah di-pause?\n')

    const rec = await runAdsAnalystAgent({
        postEngagementRate: 0.8,
        postReach: 400,
        campaign: {
            campaignId: 'mock-campaign-456',
            campaignName: 'Boost — Dress Floral Casual...',
            spend: 150_000,
            impressions: 12_000,
            reach: 9_500,
            clicks: 48,
            cpm: 12_500,
            ctr: 0.4,
        },
        currentDailyBudgetIdr: 75_000,
    })

    console.log('Rekomendasi LLM:')
    console.log(`  Action   : ${rec.action}`)
    console.log(`  Urgency  : ${rec.urgency}`)
    console.log(`  Summary  : ${rec.summary}`)
    console.log(`  Reasoning: ${rec.reasoning}`)
}

async function demo4AdsHierarchyExplain(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 4: Meta Ads Hierarchy & Safety Pattern')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log(`
Meta Ads Hierarchy:

  Campaign (objective: OUTCOME_AWARENESS)
    └── Ad Set (targeting + daily budget)
          └── Ad Creative (gambar + teks)
                └── Ad (campaign set + creative, punya status sendiri)

Safety Pattern di kode ini:
  • Semua Campaign, Ad Set, Ad dibuat dengan status = PAUSED
  • Tidak ada uang keluar sampai pemilik klik "Aktifkan" di Meta Business Manager
  • runAdsCheck.job.ts TIDAK pernah mengaktifkan campaign secara otomatis

Kapan campaign otomatis dibuat? (Human-in-the-loop trigger):
  1. Post organik: engagementRate >= 3%
  2. Ads Analyst Agent: action = BOOST_NEW
  3. MetaAdsClient.createBoostCampaign() → status PAUSED di Meta
  4. Notifikasi ke pemilik via Telegram (Fase 8)
  5. Pemilik review di Business Manager → aktifkan manual
`)

    if (!HAS_ADS) {
        console.log('⚠️  META_ADS_ACCOUNT_ID / META_ADS_ACCESS_TOKEN tidak dikonfigurasi.')
        console.log('   Demo create campaign dilewati.')
        console.log()
        console.log('   Untuk mengaktifkan:')
        console.log('   1. Buat Meta Business Account di business.facebook.com')
        console.log('   2. Buat Ad Account (format: act_XXXXXXXXX)')
        console.log('   3. Generate access token dengan permission ads_management')
        console.log('   4. Tambahkan ke .env:')
        console.log('      META_ADS_ACCOUNT_ID=act_XXXXXXXXX')
        console.log('      META_ADS_ACCESS_TOKEN=EAAxxxxxxxxx')
    } else {
        console.log('✅ Meta Ads dikonfigurasi. Untuk test create campaign:')
        console.log('   Jalankan runAdsCheck.job.ts dengan data PostAnalytics di DB')
    }
}

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗')
    console.log('║  Fase 7: Meta Ads & Ads Analyst Agent Demo        ║')
    console.log('╚══════════════════════════════════════════════════╝')

    await demo1AdsAnalystHighEngagement()
    await demo2AdsAnalystActiveCampaign()
    await demo3AdsAnalystPoorPerformance()
    await demo4AdsHierarchyExplain()

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Demo selesai!')
    console.log()
    console.log('Key Takeaways:')
    console.log('  1. Ads Analyst Agent = LLM membaca data angka → keputusan bisnis')
    console.log('  2. Semua campaign dibuat PAUSED — manusia tetap pengambil keputusan akhir')
    console.log('  3. Trigger otomatis: engagementRate > 3% → agent evaluate → create PAUSED campaign')
    console.log('  4. Tidak butuh dashboard custom — kontrol via Meta Business Manager')
    console.log()
    console.log('Selanjutnya → Fase 8: Review Dashboard (Hono) + Telegram Notifications')
}

main().catch(err => {
    console.error('Demo error:', err)
    process.exit(1)
})
