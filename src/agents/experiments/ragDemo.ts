import { logger } from '../../lib/logger.js'
import { seedBrandKnowledge } from '../../lib/ragSeeder.js'
import { retrieveRelevant, type KnowledgeCategory } from '../../lib/ragService.js'

interface TestQuery {
    q: string
    category?: KnowledgeCategory
    topK?: number
}

const TEST_QUERIES: TestQuery[] = [
    {
        q: 'cara menulis caption batik yang engaging dan autentik',
        category: 'brand_voice',
    },
    {
        q: 'produk untuk acara formal dan semi-formal',
        category: 'product',
    },
    {
        q: 'konten apa yang pernah ditolak oleh brand owner',
        category: 'rejection_lesson',
    },
    {
        q: 'kapan waktu terbaik posting konten lifestyle',
        topK: 5,
    },
]

async function runRagDemo() {
    logger.info('🧠 Memulai RAG Demo...')

    logger.info('📚 Seeding brand knowledge...')
    await seedBrandKnowledge({ clearExisting: true })

    console.log('\n' + '═'.repeat(50))
    console.log('           RAG RETRIEVAL TEST')
    console.log('═'.repeat(50))

    for (const { q, category, topK } of TEST_QUERIES) {
        console.log(`\n🔍 Query   : "${q}"`)
        console.log(`   Filter  : ${category ?? 'semua kategori'}`)
        console.log(`   Top-K   : ${topK ?? 3}\n`)

        const options = {
            similarityThreshold: 0.5,
            ...(topK !== undefined ? { topK } : {}),
            ...(category !== undefined ? { category } : {}),
        }

        const results = await retrieveRelevant(q, options)

        if (results.length === 0) {
            console.log('   ⚠️  Tidak ada hasil relevan ditemukan')
            continue
        }

        for (const r of results) {
            const pct = (r.similarity * 100).toFixed(1)
            const preview = r.content.slice(0, 100).replace(/\n/g, ' ')
            console.log(`   ✅ [${r.category}] similarity: ${pct}%`)
            console.log(`      ${preview}...`)
        }
    }

    console.log('\n' + '═'.repeat(50))
    logger.info('✅ RAG Demo selesai')
}

runRagDemo().catch(console.error)
