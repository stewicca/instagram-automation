import { logger } from '../lib/logger.js'
import { langfuse, type LangfuseTrace } from '../lib/langfuse.js'
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
    request: OrchestratorRequest,
    // traceId opsional — diisi dari job untuk menghubungkan BullMQ job ke Langfuse trace
    traceId?: string
): Promise<OrchestratorResult> {
    const startTime = Date.now()

    // Buat Langfuse trace untuk seluruh orchestration run
    // Jika Langfuse tidak dikonfigurasi, trace = null dan semua .span() call di-skip
    const trace: LangfuseTrace | null = langfuse?.trace({
        id: traceId ?? null,
        name: 'content-orchestrator',
        input: request,
        metadata: {
            topic: request.topic,
            productType: request.productType,
        },
    }) ?? null

    logger.info(
        { topic: request.topic, productType: request.productType, traceId },
        '🎬 Orchestrator starting — Step 1: Content Planning'
    )

    // Step 1: Content Planner (sequential — hasilnya dibutuhkan oleh step 2)
    const plan = await runContentPlannerAgent(request, trace)

    logger.info(
        { contentPillar: plan.contentPillar, angle: plan.angle },
        '🎬 Orchestrator — Step 2: Caption + Image Prompt (parallel)'
    )

    // Step 2: Caption + Image Prompt berjalan paralel
    // Keduanya hanya butuh `plan` dari step 1, tidak saling bergantung
    const [captionResult, imageResult] = await Promise.all([
        runCaptionAgent(plan, trace),
        runImagePromptAgent(plan, trace),
    ])

    const durationMs = Date.now() - startTime

    // Update trace dengan output final dan durasi
    trace?.update({
        output: {
            contentPillar: plan.contentPillar,
            captionPreview: captionResult.caption.slice(0, 100),
        },
        metadata: { durationMs },
    })

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
