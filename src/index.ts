import { logger } from './lib/logger.js'
import { InstagramClient } from './instagram/client.js'

async function main() {
    logger.info('Instagram Automation - starting up')

    const client = new InstagramClient()

    const [profile, recentMedia] = await Promise.all([
        client.getProfile(),
        client.getRecentMedia(10),
    ])

    logger.info({
        username: profile.username,
        followers: profile.followers_count,
        totalPosts: profile.media_count,
    }, 'Profile fetched')

    logger.info({
        fetchedCount: recentMedia.data.length,
        types: recentMedia.data.map(m => m.media_type),
    }, 'Recent media fetched')
}

main().catch(err => {
    logger.error({ err }, 'Fatal error'),
        process.exit(1)
})
