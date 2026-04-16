import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InstagramClient } from '../src/instagram/client.js'

vi.mock('../src/lib/httpClient.js', () => ({
    fetchWithRetry: vi.fn(),
}))

import { fetchWithRetry } from '../src/lib/httpClient.js'
const mockFetch = vi.mocked(fetchWithRetry)

describe('InstagramClient', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token'
        process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = '123456'
        process.env.ANTHROPIC_API_KEY = 'sk-ant-test',
            process.env.DATABASE_URL = 'postgresql://localhost/test'
    })

    it('getProfile returns parsed profile', async () => {
        mockFetch.mockResolvedValueOnce({
            id: '123456',
            username: 'fashionbrand_id',
            followers_count: 1500,
            media_count: 42,
        })

        const client = new InstagramClient()
        const profile = await client.getProfile()

        expect(profile.username).toBe('fashionbrand_id')
        expect(profile.followers_count).toBe(1500)
    })

    it('getProfile throws if API returns unexpected shape', async () => {
        mockFetch.mockResolvedValueOnce({ unexpected: 'data' })

        const client = new InstagramClient()
        await expect(client.getProfile()).rejects.toThrow('unexpected profile shape')
    })
})
