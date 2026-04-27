/**
 * Fase 8: Hono HTTP Server
 *
 * Review dashboard untuk human-in-the-loop approval.
 * Berjalan berdampingan dengan BullMQ workers di proses yang sama.
 *
 * Routes:
 *   GET  /health                       — health check (DB + Redis)
 *   GET  /review/drafts                — list draft PENDING_REVIEW
 *   GET  /review/drafts/:id            — detail draft
 *   POST /review/drafts/:id/approve    — approve + schedule publish
 *   POST /review/drafts/:id/reject     — reject + simpan feedback
 *
 * Development testing:
 *   curl http://localhost:3000/health
 *   curl http://localhost:3000/review/drafts
 *   curl -X POST http://localhost:3000/review/drafts/<id>/approve \
 *     -H "Content-Type: application/json" \
 *     -d '{"scheduleInMinutes": 30}'
 */
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { health } from './routes/health.js'
import { review } from './routes/review.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

export function createServer(): { start: () => void; stop: () => Promise<void> } {
    const app = new Hono()

    app.route('/health', health)
    app.route('/review', review)

    app.notFound((c) => c.json({ error: 'Not found' }, 404))

    app.onError((err, c) => {
        logger.error({ err, path: c.req.path }, 'Unhandled server error')
        return c.json({ error: 'Internal server error' }, 500)
    })

    let serverHandle: ReturnType<typeof serve> | null = null

    return {
        start() {
            serverHandle = serve({
                fetch: app.fetch,
                port: env.PORT,
            })

            logger.info({ port: env.PORT }, `Review dashboard running at http://localhost:${env.PORT}`)
        },

        async stop() {
            if (serverHandle) {
                await new Promise<void>((resolve) => {
                    serverHandle!.close(() => resolve())
                })
                logger.info('HTTP server closed')
            }
        },
    }
}
