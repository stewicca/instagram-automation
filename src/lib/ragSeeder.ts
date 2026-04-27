import { logger } from './logger.js'
import { indexChunks, type KnowledgeChunk } from './ragService.js'
import { getBrandKnowledge } from './agentLongTermMemory.js'
import { db } from './db.js'

const STATIC_CHUNKS: KnowledgeChunk[] = [
    {
        content: `Nusantara Wear menggunakan tone hangat dan personal — seperti teman stylish, bukan brand yang menjual.
Confident tapi tidak arrogant. Storytelling adalah kunci — setiap produk punya cerita pengrajin dan daerah asalnya.
Gunakan Bahasa Indonesia yang natural, bukan formal kaku. Maksimal 150 kata per caption.`,
        category: 'brand_voice',
        metadata: { source: 'brand_guidelines', type: 'tone', version: '1.0' },
    },

    {
        content: `Yang HARUS ada di setiap caption Nusantara Wear:
- Hook kuat di kalimat pertama (orang scroll cepat, butuh langsung tertarik)
- Koneksi emosional ke nilai lokal atau sustainability
- 1-2 emoji yang relevan, tidak berlebihan
Yang TIDAK boleh: terlalu sales-y, bahasa Inggris berlebihan, klaim tidak terbuktikan, lebih dari 2 tanda seru per caption.`,
        category: 'brand_voice',
        metadata: { source: 'brand_guidelines', type: 'rules', version: '1.0' },
    },

    {
        content: `Target audience Nusantara Wear: profesional urban Indonesia, 25-38 tahun, income menengah atas.
Mereka menghargai kualitas, menyukai cerita di balik produk, peduli sustainability, dan bangga pakai produk lokal.
Konten yang resonan: behind the scenes pengrajin, cara styling batik ke kantor, cerita asal-usul kain tradisional.`,
        category: 'brand_voice',
        metadata: { source: 'brand_guidelines', type: 'audience', version: '1.0' },
    },

    {
        content: `Kemeja Batik Pria Nusantara Wear — line utama. Motif dari Jogja, Solo, dan Pekalongan.
Material: katun primissima 100%. Harga: 350-550 ribu.
Best seller: motif parang modern, sogan contemporary.
Caption angle terbaik: "dari tangan pengrajin ke lemari kamu", "batik yang bisa dipakai meeting sampai weekend".`,
        category: 'product',
        metadata: {
            productLine: 'kemeja_batik_pria',
            priceRange: '350000-550000',
            origins: ['jogja', 'solo', 'pekalongan'],
        },
    },

    {
        content: `Dress Tenun Wanita Nusantara Wear — line premium. Material tenun dari NTT dan Lombok.
Harga: 650-950 ribu. Cocok untuk: acara semi-formal, pernikahan, gathering kantor.
Caption angle terbaik: "karya tangan penenun yang butuh 3 hari untuk satu lembar kain", "sustainable fashion dalam artian sesungguhnya".`,
        category: 'product',
        metadata: {
            productLine: 'dress_tenun_wanita',
            priceRange: '650000-950000',
            origins: ['ntt', 'lombok'],
        },
    },

    {
        content: `Konten Ramadan untuk Nusantara Wear: fokus pada tema "tampil anggun di bulan suci dengan kain lokal".
Highlight kemeja batik warna earth tone (coklat sogan, biru indigo).
Waktu posting terbaik: setelah sahur (05:00-06:00) dan setelah buka (19:30-21:00).
Hashtag khusus Ramadan: #BatikLebaran #RamadanStyle #FashionMuslim #BusanaLokal.`,
        category: 'brand_voice',
        metadata: { source: 'seasonal_guide', season: 'ramadan' },
    },

    {
        content: `Konten akhir pekan untuk Nusantara Wear: tone lebih santai, fokus pada lifestyle bukan produk.
Angle terbaik: cara mix-and-match batik kasual, inspirasi outfit weekend, family gathering dengan batik.
Posting terbaik: Jumat 18:00-20:00 atau Sabtu 09:00-11:00.`,
        category: 'brand_voice',
        metadata: { source: 'seasonal_guide', season: 'weekend' },
    },
]

async function buildDynamicChunks(): Promise<KnowledgeChunk[]> {
    const brandKnowledge = await getBrandKnowledge()
    const chunks: KnowledgeChunk[] = []

    for (const insight of brandKnowledge.recentInsights) {
        if (insight.totalPosts < 3) continue

        chunks.push({
            content: `Konten dengan pillar "${insight.pillar}" rata-rata mendapat engagement rate ${(insight.avgEngagementRate * 100).toFixed(1)}% dari ${insight.totalPosts} posts.
${insight.bestPostTime ? `Waktu terbaik posting: ${insight.bestPostTime}.` : ''}
${insight.topHashtags.length > 0 ? `Hashtag yang sering performa baik: ${insight.topHashtags.join(', ')}.` : ''}`,
            category: 'performance_insight',
            metadata: {
                pillar: insight.pillar,
                avgEngagementRate: insight.avgEngagementRate,
                totalPosts: insight.totalPosts,
                generatedAt: new Date().toISOString(),
            },
        })
    }

    for (const pattern of brandKnowledge.rejectionPatterns) {
        if (pattern.count < 2) continue

        chunks.push({
            content: `Konten dengan pola "${pattern.reason}" sudah ditolak ${pattern.count} kali oleh brand owner.
Contoh caption yang ditolak: ${pattern.examples.map(e => `"${e}..."`).join('; ')}.
Hindari pola ini saat membuat konten baru untuk Nusantara Wear.`,
            category: 'rejection_lesson',
            metadata: {
                pattern: pattern.reason,
                occurrences: pattern.count,
                generatedAt: new Date().toISOString(),
            },
        })
    }

    return chunks
}

export async function seedBrandKnowledge(options: {
    includeStatic?: boolean
    includeDynamic?: boolean
    clearExisting?: boolean
} = {}): Promise<void> {
    const {
        includeStatic = true,
        includeDynamic = true,
        clearExisting = false,
    } = options

    if (clearExisting) {
        await db.brandKnowledgeChunk.deleteMany({})
        logger.info('🗑️  Cleared existing knowledge chunks')
    }

    const allChunks: KnowledgeChunk[] = []

    if (includeStatic) {
        allChunks.push(...STATIC_CHUNKS)
        logger.info({ count: STATIC_CHUNKS.length }, '📝 Static chunks queued')
    }

    if (includeDynamic) {
        const dynamicChunks = await buildDynamicChunks()
        allChunks.push(...dynamicChunks)
        logger.info({ count: dynamicChunks.length }, '📊 Dynamic chunks queued')
    }

    if (allChunks.length === 0) {
        logger.warn('No chunks to index')
        return
    }

    await indexChunks(allChunks)
    logger.info({ total: allChunks.length }, '✅ Brand knowledge seeded')
}
