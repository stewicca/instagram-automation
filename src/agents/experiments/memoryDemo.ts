import { generateText, stepCountIs } from 'ai'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { createAgentSession } from '../../lib/agentMemory.js'
import { getBrandKnowledge } from '../../lib/agentLongTermMemory.js'
import {
	  getPastPerformance,
	  getScheduledContent,
	  getRejectionInsights,
	  saveContentDraft,
} from '../tools/contentPlannerTools.js'

async function runMemoryDemo() {
	  logger.info('🧠 Memulai Agent Memory Demo...')

	  const memory = await createAgentSession('contentPlanner')

	  logger.info('📚 Loading brand knowledge dari long-term memory...')
	  const brandKnowledge = await getBrandKnowledge()

	  await memory.remember('brandKnowledge', brandKnowledge)

	  logger.info({
		    insightCount: brandKnowledge.recentInsights.length,
		    rejectionPatternCount: brandKnowledge.rejectionPatterns.length,
	  }, '📚 Brand knowledge loaded')

	  const longTermContext = formatBrandKnowledge(brandKnowledge)

	  try {
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

				        === LONG-TERM MEMORY (Brand Knowledge) ===
				        ${longTermContext}
				        === END LONG-TERM MEMORY ===

				        TUGASMU:
				        1. Gunakan brand knowledge di atas sebagai baseline
				        2. Cek konten yang sudah dijadwalkan untuk menghindari duplikasi
				        3. Buat SATU draft konten yang lebih baik dari rata-rata performa sebelumnya
				        4. Hindari pola yang ada di rejection patterns

				        ATURAN: Setelah saveContentDraft berhasil, STOP.
			      `.trim(),
			      prompt: 'Buat satu konten Instagram untuk Nusantara Wear hari ini.',
			      onStepFinish: async ({ toolCalls, toolResults, text }) => {
				        if (toolCalls?.length) {
					          for (const call of toolCalls) {
						            await memory.addStepResult({
							              toolName: call.toolName,
							              input: call.input,
							              output: null,
							              timestamp: new Date().toISOString(),
						            })
					          }
					          logger.info({ tools: toolCalls.map(t => t.toolName) }, '⚡ Tools dipanggil')
				        }

				        if (text) {
					          await memory.addDecision({
						            reasoning: text.slice(0, 200),
						            decided: 'step completed',
						            timestamp: new Date().toISOString(),
					          })
				        }
			      },
		    })

		    await memory.complete()

		    const workingMem = await memory.getWorkingMemory()
		    logger.info({
			      sessionId: memory.sessionId,
			      stepCount: workingMem.stepResults.length,
			      decisionCount: workingMem.decisions.length,
		    }, '✅ Session selesai')

		    console.log('\n=== HASIL AGENT ===\n')
		    console.log(result.text)
		    console.log('\n=== WORKING MEMORY SNAPSHOT ===\n')
		    console.log(JSON.stringify(workingMem, null, 2))
	  } catch (error) {
		    await memory.fail(error instanceof Error ? error.message : 'Unknown error')
		    throw error
	  }
}

function formatBrandKnowledge(knowledge: Awaited<ReturnType<typeof getBrandKnowledge>>): string {
	  const lines: string[] = []

	  if (knowledge.recentInsights.length > 0) {
		    lines.push('PERFORMA KONTEN TERBAIK:')
		    for (const insight of knowledge.recentInsights.slice(0, 3)) {
			      lines.push(
				        `- ${insight.pillar}: avg engagement ${(insight.avgEngagementRate * 100).toFixed(1)}%` +
				        ` (${insight.totalPosts} posts)` +
				        (insight.bestPostTime ? `, best time: ${insight.bestPostTime}` : '')
			      )
		    }
	  } else {
	    	lines.push('PERFORMA: Belum ada data historis (akun baru).')
	  }

	  if (knowledge.rejectionPatterns.length > 0) {
		    lines.push('\nPOLA YANG HARUS DIHINDARI:')
		    for (const pattern of knowledge.rejectionPatterns) {
		      	lines.push(`- "${pattern.reason}" (ditolak ${pattern.count}x)`)
		    }
	  }

	  return lines.join('\n')
}

runMemoryDemo().catch(console.error)
