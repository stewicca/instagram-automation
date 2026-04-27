import { Hono } from 'hono'
import { db } from '../../lib/db.js'
import { redisConnection } from '../../lib/queue.js'

const health = new Hono()

health.get('/', async (c) => {
    const checks = await Promise.allSettled([
        db.$queryRaw`SELECT 1`.then(() => 'ok' as const),
        redisConnection.ping().then(() => 'ok' as const),
    ])

    const [dbStatus, redisStatus] = checks.map(r =>
        r.status === 'fulfilled' ? r.value : 'error'
    )

    const healthy = dbStatus === 'ok' && redisStatus === 'ok'

    return c.json(
        {
            status: healthy ? 'ok' : 'degraded',
            services: { db: dbStatus, redis: redisStatus },
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
        },
        healthy ? 200 : 503
    )
})

export { health }
