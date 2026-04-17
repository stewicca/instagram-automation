import { describe, it, expect, vi } from 'vitest'
import {
    createRevisionSession,
    reviseContent,
} from '../src/agents/contentReviser.js'
import type { ContentOutput } from '../src/agents/contentGenerator.js'

vi.mock('../src/lib/claudeClient.js', () => ({
    generate: vi.fn(),
    appendMessage: (history: { messages: unknown[] }, role: string, content: string) => ({
        messages: [...history.messages, { role, content }],
    }),
    CLAUDE_MODELS: { SONNET: 'claude-sonnet-4-5' },
}))

import { generate } from '../src/lib/claudeClient.js'
const mockGenerate = vi.mocked(generate)

const MOCK_CONTENT: ContentOutput = {
    caption: 'Caption formal yang terlalu kaku untuk brand kita.',
    hashtags: ['#BatikModern', '#Fashion', '#OOTD', '#Lokal', '#Indonesia'],
    imagePrompt: 'Batik shirt on white background, studio lighting',
    bestPostingTime: 'Selasa 19:00 WIB',
    contentPillar: 'lifestyle',
}

const REVISED_CONTENT: ContentOutput = {
    caption: 'Santai tapi tetap stylish — itulah Nusantara Wear. 🌿',
    hashtags: ['#BatikModern', '#Fashion', '#OOTD', '#Lokal', '#Indonesia'],
    imagePrompt: 'Batik shirt flat lay, natural light, casual mood',
    bestPostingTime: 'Selasa 19:00 WIB',
    contentPillar: 'lifestyle',
}

describe('reviseContent', () => {
    it('revises content base on feedback', async () => {
        mockGenerate.mockResolvedValueOnce(JSON.stringify(REVISED_CONTENT))
        
        const session = createRevisionSession(MOCK_CONTENT)
        const { content, session: updatedSession } = await reviseContent(
            session,
            'Caption terlalu formal, buat lebih casual dan friendly'
        )
        
        expect(content.caption).toBe(REVISED_CONTENT.caption)
        expect(updatedSession.history.messages).toHaveLength(4)
        expect(updatedSession.revisionCount).toBe(1)
    })
    
    it('throws after max revisions', async () => {
        const session = {
            ...createRevisionSession(MOCK_CONTENT),
            revisionCount: 5,
        }
        
        await expect(
            reviseContent(session, 'feedback apapun')
        ).rejects.toThrow('Maximum revisions')
    })
})