import { describe, it, expect, vi } from 'vitest'
import { generateContent, ContentOutputSchema } from '../src/agents/contentGenerator.js'

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
            USE_LOCAL_LLM: false,
        },
    }
})

import { generateText } from 'ai'
const mockGenerateText = vi.mocked(generateText)

const MOCK_CONTENT = {
    caption: 'Dari tangan pengrajin Jogja, hadir kemeja batik yang bicara tentang keanggunan. 🌿',
    hashtags: ['#BatikModern', '#NusantaraWear', '#FashionLokal', '#OOTD', '#BatikIndonesia'],
    imagePrompt: 'Elegant batik shirt flat lay on marble surface, natural morning light',
    bestPostingTime: 'Selasa 19:00 WIB',
    contentPillar: 'lifestyle' as const,
}

describe('generateContent', () => {
    it('returns valid ContentOutput', async () => {
        mockGenerateText.mockResolvedValueOnce({
            output: MOCK_CONTENT,
            text: '',
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

        const result = await generateContent({
            topic: 'Kemeja batik modern',
            productType: 'Kemeja pria',
        })

        expect(ContentOutputSchema.safeParse(result).success).toBe(true)
        expect(result.hashtags.every(h => h.startsWith('#'))).toBe(true)
        expect(result.contentPillar).toBe('lifestyle')
    })
})
