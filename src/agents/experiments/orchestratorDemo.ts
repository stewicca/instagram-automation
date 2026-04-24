import { runContentOrchestrator } from '../orchestrator.js'
import { logger } from '../../lib/logger.js'

async function runOrchestratorDemo() {
    logger.info('🎬 Starting Multi-Agent Orchestrator Demo')

    const result = await runContentOrchestrator({
        topic: 'batik kontemporer untuk profesional muda',
        productType: 'kemeja batik pria',
        currentMoment: 'menjelang akhir pekan',
    })

    console.log('\n═══════════════════════════════════════')
    console.log('           HASIL ORCHESTRATOR           ')
    console.log('═══════════════════════════════════════\n')

    console.log('📋 CONTENT PLAN:')
    console.log(`   Angle   : ${result.plan.angle}`)
    console.log(`   Emosi   : ${result.plan.targetEmotion}`)
    console.log(`   Pillar  : ${result.contentPillar}`)
    console.log(`   Post at : ${result.bestPostTime}`)
    console.log(`   Keywords: ${result.plan.keywords.join(', ')}`)

    console.log('\n✍️  CAPTION:')
    console.log(result.caption)

    console.log('\n#️⃣  HASHTAGS:')
    console.log(result.hashtags.join(' '))

    console.log('\n💬 CALL TO ACTION:')
    console.log(result.callToAction)

    console.log('\n🎨 IMAGE PROMPT:')
    console.log(result.imagePrompt)

    console.log('\n🖼️  STYLE & COLORS:')
    console.log(`   Style  : ${result.imageStyle}`)
    console.log(`   Colors : ${result.colorPalette.join(', ')}`)

    console.log('\n⏱️  PERFORMANCE:')
    console.log(`   Total duration: ${result.durationMs}ms`)
    console.log()
}

runOrchestratorDemo().catch(console.error)
