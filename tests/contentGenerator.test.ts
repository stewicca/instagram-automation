import { describe, it, expect, vi } from 'vitest'
import { generateContent, ContentOutputSchema } from '../src/agents/contentGenerator.js'

vi.mock('../src/lib/claudeClient.js', () => ({
    generate: vi.fn(),
    CLAUDE_MODELS: {
        OPUS: 'claude-opus-4-6',
        SONNET: 'claude-sonnet-4-6',
        HAIKU: 'claude-haiku-4-5-20251001',
    },
}))

import { generate } from '../src/lib/claudeClient.js'
const mockGenerate = vi.mocked(generate)

const MOCK_RESPONSE = JSON.stringify({
    caption: 'Dari tangan pengrajin Jogja, hadir kemeja batik yang bicara tentang keanggunan tanpa batas. Ditenun dengan kesabaran, dipakai dengan kebanggaan. 🌿',
    hashtags: ['#BatikModern', '#NusantaraWear', '#FashionLokal', '#OOTD', '#BatikIndonesia'],
    imagePrompt: 'Elegant batik shirt flat lay on marble surface, natural morning light, minimalist composition, earth tones, high-end fashion photography',
    bestPostingTime: 'Selasa 19:00 WIB',
    contentPillar: 'lifestyle',
})

describe('generateContent', () => {
    it('returns valid ContentOutput for balik shirt', async () => {
        mockGenerate.mockResolvedValueOnce(MOCK_RESPONSE)

        const result = await generateContent({
            topic: 'Kemeja batik modern',
            productType: 'Kemeja pria',
        })

        expect(ContentOutputSchema.safeParse(result).success).toBe(true)
        expect(result.hashtags.every(h => h.startsWith('#'))).toBe(true)
        expect(result.contentPillar).toBe('lifestyle')
    })

    it('handles LLM response wrapped in markdown code blocks', async () => {
        mockGenerate.mockResolvedValueOnce(`\`\`\`json\n${MOCK_RESPONSE}\n\`\`\``)

        const result = await generateContent({
            topic: 'Dress tenun',
            productType: 'Dress wanita',
        })

        expect(result.caption).toBeTruthy()
    })

    it('throws if LLM returns invalid structure', async () => {
        mockGenerate.mockResolvedValueOnce(JSON.stringify({ invalid: 'structure' }))

        await expect(
            generateContent({ topic: 'test', productType: 'test' })
        ).rejects.toThrow('invalid output structure')
    })
})
