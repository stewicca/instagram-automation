import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'

const searchTrendingFashion = tool({
    description: 'Cari tren fashion terkini di Indonesia',
    inputSchema: z.object({
        keyword: z.string().describe('Kata kunci pencarian'),
    }),
    execute: async ({ keyword }: { keyword: string }) => {
        logger.info({ keyword }, '🔍 Tool dipanggil: searchTrendingFashion')
        await new Promise(r => setTimeout(r, 500))
        return {
            trends: ['batik kontemporer', 'tenun modern', 'kebaya kasual'],
            topHashtag: '#BatikModern',
            source: 'trending.id',
        }
    },
})

const getBrandVoice = tool({
    description: 'Ambil panduan brand voice Nusantara Wear',
    inputSchema: z.object({}),
    execute: async () => {
        logger.info('🎨 Tool dipanggil: getBrandVoice')
        return {
            tone: 'hangat, autentik, bangga budaya lokal',
            avoid: ['terlalu formal', 'bahasa asing berlebihan'],
            emoji: 'boleh, tapi tidak lebih dari 2 per caption',
        }
    },
})

async function runReActDemo() {
    logger.info('🤖 Memulai ReAct Agent Demo...')
  
    const result = await generateText({
        model: aiModel,
        tools: { searchTrendingFashion, getBrandVoice },
        stopWhen: stepCountIs(5),
        prompt: `
            Kamu adalah content planner untuk brand fashion lokal Indonesia "Nusantara Wear".
            Tugasmu: cari tren fashion terkini, pahami brand voice kami,
            lalu sarankan ide konten Instagram untuk besok.
            Gunakan tools yang tersedia sebelum memberi saran.
        `,
        onStepFinish: ({ toolCalls, toolResults, text }) => {
            if (toolCalls?.length) {
                logger.info(
                    { tools: toolCalls.map(t => t.toolName) },
                    '⚡ REASON → ACT: Agent memilih tools'
                )
            }
            if (toolResults?.length) {
                logger.info('👁️  OBSERVE: Agent memproses hasil tool')
            }
            if (text) {
                logger.info({ preview: text.slice(0, 100) }, '💭 Agent berpikir...')
            }
        },
    })
  
    logger.info({ steps: result.steps.length }, '✅ Agent selesai! Total langkah ReAct')
    console.log('\n=== HASIL AKHIR ===\n')
    console.log(result.text)
}

runReActDemo().catch(console.error)
