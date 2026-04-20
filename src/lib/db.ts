import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { logger } from './logger.js'
import { env } from '../config/env.js'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const db = new PrismaClient({ adapter })

db.$connect()
    .then(() => logger.info('Database connected'))
    .catch((err) => {
        logger.fatal({ err }, 'Database connection failed')
        process.exit(1)
    })

export type { PrismaClient }
