import pino from 'pino'
import { env } from '../config/env.js'

const isDevelopment = env.NODE_ENV === 'development' && env.LOG_LEVEL !== 'silent'

export const logger = pino(
    isDevelopment
        ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } }
        : { level: env.LOG_LEVEL }
)
