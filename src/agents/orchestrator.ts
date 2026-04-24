import { logger } from '../lib/logger.js'
import { runContentPlannerAgent } from './specialists/contentPlannerAgent.js'
import { runCaptionAgent } from './specialists/captionAgent.js'
import { runImagePromptAgent } from './specialists/imagePromptAgent.js'

export interface OrchestratorRequest {
    topic: string
    productType: string
    currentMoment?: string
}

export interface OrchestratorResult {
    plan: Awaited<ReturnType<typeof runContentPlannerAgent>>
    caption: string
    hashtags: string[]
    callToAction: string
    imagePrompt: string
    imageStyle: string
    colorPalette: string[]
    contentPillar: string
    bestPostTime: string
    durationMs: number
}

export async function runContentOrchestrator(
    request: OrchestratorRequest
): Promise<OrchestratorResult> {
    const startTime = Date.now()

    logger.info(
        { topic: request.topic, productType: request.productType },
        '🎬 Orchestrator starting — Step 1: Content Planning'
    )

    const plan = await runContentPlannerAgent(request)

    logger.info(
        { contentPillar: plan.contentPillar, angle: plan.angle },
        '🎬 Orchestrator — Step 2: Caption + Image Prompt (parallel)'
    )

    const [captionResult, imageResult] = await Promise.all([
        runCaptionAgent(plan),
        runImagePromptAgent(plan),
    ])

    const durationMs = Date.now() - startTime

    logger.info(
        { durationMs, contentPillar: plan.contentPillar },
        '🎬 Orchestrator done'
    )

    return {
        plan,
        caption: captionResult.caption,
        hashtags: captionResult.hashtags,
        callToAction: captionResult.callToAction,
        imagePrompt: imageResult.imagePrompt,
        imageStyle: imageResult.style,
        colorPalette: imageResult.colorPalette,
        contentPillar: plan.contentPillar,
        bestPostTime: plan.suggestedPostTime,
        durationMs,
    }
}
