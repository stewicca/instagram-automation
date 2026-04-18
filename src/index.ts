import { logger } from './lib/logger.js'
import { InstagramClient } from './instagram/client.js'
import { generateContent } from './agents/contentGenerator.js'
import { createRevisionSession, reviseContent } from './agents/contentReviser.js'
import { getDailyCost } from './lib/costTracker.js'

async function main() {
    logger.info('Instagram Automation - starting up')

    const client = new InstagramClient()

    logger.info('Fetching profile...')
    const [profile, recentMedia] = await Promise.allSettled([
        client.getProfile(),
        client.getRecentMedia(10),
    ])

    if (profile.status === 'fulfilled') {
        logger.info({
            username: profile.value.username,
            followers: profile.value.followers_count,
            totalPosts: profile.value.media_count,
        }, 'Profile fetched')
    } else {
        logger.warn({ error: profile.reason }, 'Could not fetch profile — continuing')
    }

    if (recentMedia.status === 'fulfilled') {
        logger.info({
            fetchedCount: recentMedia.value.data.length,
            types: recentMedia.value.data.map(m => m.media_type),
        }, 'Recent media fetched')
    } else {
        logger.warn('Could not fetch recent media — continuing')
    }

    logger.info('Generating content...')
    const content = await generateContent({
    		topic: 'Kemeja batik modern untuk meeting',
     		productType: 'Kemeja pria',
        currentMoment: 'Back to office season',
    })

    logger.info({
        contentPillar: content.contentPillar,
        captionLength: content.caption.length,
        hashtagCount: content.hashtags.length,
        bestTime: content.bestPostingTime,
    }, 'Content generated')

    logger.info('Simulating revision flow...')
    let session = createRevisionSession(content)

    const { content: revised } = await reviseContent(
        session,
        'Caption terlalu formal — buat lebih casual dan tambahkan referensi ke kenyamanan bahan'
    )

    logger.info({
        originalCaption: content.caption.slice(0, 50) + '...',
        revisedCaption: revised.caption.slice(0, 50) + '...',
    }, 'Revision complete')

    logger.info({
        dailyCostUsd: getDailyCost().toFixed(6),
    }, 'Session complete')
}

main().catch(err => {
    logger.error({ err }, 'Fatal error'),
    process.exit(1)
})
