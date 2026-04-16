import pino from 'pino'
import { env } from '../config/env.js'

export const logger = pino({
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' && env.LOG_LEVEL !== 'silent'
        ? { target: 'pino-pretty' }
        : undefined,
})
