import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { afterAll, beforeEach } from 'vitest'

const adapter = new PrismaPg({
    connectionString: process.env['DATABASE_URL_TEST'],
})

export const testDb = new PrismaClient({ adapter })

beforeEach(async () => {
    await testDb.postAnalytics.deleteMany()
    await testDb.contentDraft.deleteMany()
    await testDb.rejectionFeedback.deleteMany()
    await testDb.jobLog.deleteMany()
})

afterAll(async () => {
    await testDb.$disconnect()
})
