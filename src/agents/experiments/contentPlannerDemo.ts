import { generateText, stepCountIs } from 'ai'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import {
	  getPastPerformance,
	  getScheduledContent,
	  getRejectionInsights,
	  saveContentDraft,
} from '../tools/contentPlannerTools.js'

async function runContentPlannerDemo() {
	  logger.info('🗓️  Memulai Content Planner Agent Demo...')

	  const result = await generateText({
		    model: aiModel,
		    tools: {
			      getPastPerformance,
			      getScheduledContent,
			      getRejectionInsights,
			      saveContentDraft,
		    },
		    stopWhen: stepCountIs(10),
		    system: `
			      Kamu adalah AI Content Planner untuk brand fashion lokal Indonesia "Nusantara Wear".

			      TUGASMU:
			      1. Cek performa konten masa lalu untuk tahu apa yang berhasil
			      2. Cek konten yang sudah dijadwalkan untuk menghindari duplikasi pillar
			      3. Cek konten yang pernah ditolak untuk menghindari pola yang sama
			      4. Buat SATU draft konten baru yang relevan dan simpan ke database

			      ATURAN PENTING:
			      - Selalu gunakan tools SEBELUM membuat konten
			      - Pilih contentPillar yang berbeda dari yang sudah banyak terjadwal
			      - Jangan ulangi topik yang ada di jadwal minggu ini
			      - Konten harus sesuai brand voice: hangat, autentik, bangga budaya lokal
			      - Setelah saveContentDraft berhasil, STOP dan laporkan hasilnya
		    `.trim(),
		    prompt: 'Buat satu konten Instagram untuk Nusantara Wear hari ini.',
		    onStepFinish: ({ toolCalls, toolResults, text }) => {
			      if (toolCalls?.length) {
				        logger.info(
					          { tools: toolCalls.map(t => t.toolName) },
					          '⚡ Agent memilih tools'
				        )
			      }
			      if (toolResults?.length) {
				        logger.info('👁️  Agent memproses hasil tool')
			      }
			      if (text) {
				        logger.info({ preview: text.slice(0, 80) }, '💭 Agent berpikir...')
			      }
		    },
	  })

	  logger.info({ steps: result.steps.length }, '✅ Agent selesai!')
	  console.log('\n=== LAPORAN AGENT ===\n')
	  console.log(result.text)
}

runContentPlannerDemo().catch(console.error)
