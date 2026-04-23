import { db } from '../lib/db.js'
import { Prisma } from '../generated/prisma/client.js'
import type { JobLog } from '../generated/prisma/client.js'

export type CreateJobLogInput = {
    jobName: string
    jobId: string
    status: 'completed' | 'failed'
    payload?: Prisma.InputJsonValue
    result?: Prisma.InputJsonValue
    error?: string
    duration?: number
}

export const jobLogRepository = {
    async create(input: CreateJobLogInput): Promise<JobLog> {
        return db.jobLog.create({
            data: {
                jobName: input.jobName,
                jobId: input.jobId,
                status: input.status,
                ...(input.payload !== undefined && { payload: input.payload }),
                ...(input.result !== undefined && { result: input.result }),
                ...(input.error !== undefined && { error: input.error }),
                ...(input.duration !== undefined && { duration: input.duration }),
            },
        })
    },
    async findRecent(jobName?: string, limit = 20): Promise<JobLog[]> {
        return db.jobLog.findMany({
            ...(jobName !== undefined && { where: { jobName } }),
            orderBy: { createdAt: 'desc' },
            take: limit,
        })
    },
    async countRecentFailures(jobName: string): Promise<number> {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
        return db.jobLog.count({
            where: {
                jobName,
                status: 'failed',
                createdAt: { gte: since },
            },
        })
    },
}
