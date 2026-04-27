import { generateText, stepCountIs } from 'ai'
import { aiModel } from '../../config/aiModel.js'
import { logger } from '../../lib/logger.js'
import { createAgentSession } from '../../lib/agentMemory.js'
import { retrieveRelevant } from '../../lib/ragService.js'
import {
    getPastPerformance,
    getScheduledContent,
    getRejectionInsights,
    saveContentDraft,
} from '../tools/contentPlannerTools.js'

async function runMemoryDemo() {
    logger.info('🧠 Memulai Agent Memory Demo...')

    const memory = await createAgentSession('contentPlanner')

    const topic = 'batik pria untuk profesional urban'

    logger.info('🔍 Retrieving brand knowledge via RAG...')

    const [voiceChunks, productChunks, rejectionChunks] = await Promise.all([
        retrieveRelevant(topic, { category: 'brand_voice', topK: 2 }),
        retrieveRelevant(topic, { category: 'product', topK: 2 }),
        retrieveRelevant('konten yang pernah ditolak brand owner', {
            category: 'rejection_lesson',
            topK: 2,
        }),
    ])

    const ragContext = [...voiceChunks, ...productChunks, ...rejectionChunks]
        .sort((a, b) => b.similarity - a.similarity)
        .map(c => `[${c.category.toUpperCase()}]\n${c.content}`)
        .join('\n\n---\n\n')

    logger.info(
        {
            voiceChunks: voiceChunks.length,
            productChunks: productChunks.length,
            rejectionChunks: rejectionChunks.length,
        },
        '🔍 Brand knowledge retrieved via RAG'
    )

    await memory.remember('ragQuery', topic)
    await memory.remember('ragChunkCount', {
        voice: voiceChunks.length,
        product: productChunks.length,
        rejection: rejectionChunks.length,
    })

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

                === BRAND KNOWLEDGE (retrieved via RAG, sorted by relevance) ===
                ${ragContext.length > 0 ? ragContext : 'Belum ada brand knowledge yang tersedia. Gunakan panduan umum brand fashion lokal.'}
                === END BRAND KNOWLEDGE ===

                TUGASMU:
                1. Gunakan brand knowledge di atas sebagai panduan utama
                2. Cek konten yang sudah dijadwalkan untuk menghindari duplikasi
                3. Buat SATU draft konten yang sesuai brand voice
                4. Hindari pola yang ada di rejection_lesson jika ada

                ATURAN: Setelah saveContentDraft berhasil, STOP.
            `.trim(),
            prompt: 'Buat satu konten Instagram untuk Nusantara Wear hari ini.',
            onStepFinish: async ({ toolCalls, text }) => {
                if (toolCalls?.length) {
                    for (const call of toolCalls) {
                        await memory.addStepResult({
                            toolName: call.toolName,
                            input: call.input,
                            output: null,
                            timestamp: new Date().toISOString(),
                        })
                    }
                    logger.info(
                        { tools: toolCalls.map(t => t.toolName) },
                        '⚡ Tools dipanggil'
                    )
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
        logger.info(
            {
                sessionId: memory.sessionId,
                stepCount: workingMem.stepResults.length,
                decisionCount: workingMem.decisions.length,
            },
            '✅ Session selesai'
        )

        console.log('\n=== HASIL AGENT ===\n')
        console.log(result.text)
        console.log('\n=== WORKING MEMORY SNAPSHOT ===\n')
        console.log(JSON.stringify(workingMem, null, 2))

    } catch (error) {
        await memory.fail(error instanceof Error ? error.message : 'Unknown error')
        throw error
    }
}

runMemoryDemo().catch(console.error)
