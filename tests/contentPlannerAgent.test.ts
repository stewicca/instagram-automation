import { describe, it, expect, vi } from 'vitest'
import { runContentPlannerAgent } from '../src/agents/specialists/contentPlannerAgent.js'

vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('ai')>()
    return {
        ...actual,
        generateText: vi.fn(),
    }
})

vi.mock('../src/config/aiModel.js', () => ({
    aiModel: {},
}))

vi.mock('../src/config/env.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/config/env.js')>()
    return {
        env: {
            ...actual.env,
            USE_LOCAL_LLM: true,
        },
    }
})

import { generateText } from 'ai'
const mockGenerateText = vi.mocked(generateText)

describe('runContentPlannerAgent (local llm)', () => {
    it('normalizes common key and value variants from local model output', async () => {
        mockGenerateText.mockResolvedValueOnce({
            text: `Berikut hasilnya:
            {
              "topic": "Batik kontemporer untuk profesional muda",
              "angle": "Batik yang tetap rapi dari meeting sampai hangout",
              "target_emotion": "percaya diri",
              "content_pillar": "promosi",
              "bestPostTime": "Jumat 19:00 WIB",
              "keywords": "batik modern, kemeja batik pria, outfit kerja"
            }
            Catatan: semoga membantu.`,
            output: undefined,
            toolCalls: [],
            toolResults: [],
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
            warnings: [],
            steps: [],
            sources: [],
            files: [],
            reasoning: undefined,
            reasoningDetails: [],
            response: { id: '', timestamp: new Date(), modelId: '' },
            request: {},
            experimental_providerMetadata: undefined,
        } as any)

        const result = await runContentPlannerAgent({
            topic: 'batik kontemporer untuk profesional muda',
            productType: 'kemeja batik pria',
            currentMoment: 'menjelang akhir pekan',
        })

        expect(result.contentPillar).toBe('promotional')
        expect(result.suggestedPostTime).toBe('Jumat 19:00 WIB')
        expect(result.keywords).toEqual([
            'batik modern',
            'kemeja batik pria',
            'outfit kerja',
        ])
    })
})
