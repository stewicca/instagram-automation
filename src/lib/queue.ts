import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { env } from '../config/env.js'
import { logger } from './logger.js'

export const redisConnection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
})

redisConnection.on('connect', () => logger.info('Redis connected'))
redisConnection.on('error', (err: Error) => logger.error({ err }, 'Redis error'))

export type GenerateContentPayload = {
    topic: string
    productType: string
    count: number
}

export type PublishPostPayload = {
    contentDraftId: string
}

export type FetchAnalyticsPayload = {
    contentDraftId: string
    instagramPostId: string
}

export type RunAdsCheckPayload = Record<string, never>

const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential' as const,
        delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
}

function createQueue<T>(name: string) {
    return new Queue<T>(name, {
        connection: redisConnection,
        defaultJobOptions,
    })
}

export const queues = {
    generateContent: createQueue<GenerateContentPayload>('generateContent'),
    publishPost: createQueue<PublishPostPayload>('publishPost'),
    fetchAnalytics: createQueue<FetchAnalyticsPayload>('fetchAnalytics'),
    runAdsCheck: createQueue<RunAdsCheckPayload>('runAdsCheck'),
}
