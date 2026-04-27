/**
 * Fase 6: Image Generation Service — Full Pipeline
 *
 * Orchestrates the complete flow:
 *   imagePrompt (dari Caption/Image Agent)
 *       ↓
 *   Gemini API → raw image buffer
 *       ↓
 *   Sharp: resize 1080x1080, tambah watermark brand
 *       ↓
 *   Cloud Storage (local/R2/S3) → public URL
 *       ↓
 *   ContentDraft.imageUrl di-update di DB
 *
 * Catatan penting:
 * - Image URL harus publik agar bisa di-publish ke Instagram
 * - Local storage hanya untuk dev — Instagram tidak bisa akses localhost
 * - Untuk publish ke Instagram: gunakan ngrok (dev) atau R2/S3 (production)
 */
import { generateFashionImage } from '../lib/imageGeneration.js'
import { processForInstagram, type InstagramFormat } from '../lib/imageProcessor.js'
import { uploadImage, generateImageFilename } from '../lib/cloudStorage.js'
import { db } from '../lib/db.js'
import { logger } from '../lib/logger.js'

export interface GenerateImageForDraftParams {
    contentDraftId: string
    imagePrompt: string
    format?: InstagramFormat
}

export interface ImageGenerationResult {
    imageUrl: string
    contentDraftId: string
    storage: string
    durationMs: number
}

/**
 * Generate, process, dan upload gambar untuk ContentDraft.
 * Update ContentDraft.imageUrl di DB setelah upload berhasil.
 */
export async function generateImageForDraft(
    params: GenerateImageForDraftParams
): Promise<ImageGenerationResult> {
    const { contentDraftId, imagePrompt, format = 'square' } = params
    const startTime = Date.now()

    logger.info({ contentDraftId, format }, '🖼️  Starting image generation pipeline')

    // Step 1: Generate dengan Gemini
    const generated = await generateFashionImage(imagePrompt)

    // Step 2: Process dengan Sharp (resize + watermark)
    const processed = await processForInstagram(generated.buffer, {
        format,
        quality: 90,
        addWatermark: true,
    })

    // Step 3: Upload ke storage
    const filename = generateImageFilename(contentDraftId)
    const uploaded = await uploadImage({
        buffer: processed,
        filename,
        contentType: 'image/jpeg',
    })

    // Step 4: Update ContentDraft.imageUrl di DB
    await db.contentDraft.update({
        where: { id: contentDraftId },
        data: { imageUrl: uploaded.url },
    })

    const durationMs = Date.now() - startTime

    logger.info(
        { contentDraftId, imageUrl: uploaded.url, durationMs, storage: uploaded.storage },
        '🖼️  Image generation pipeline complete'
    )

    return {
        imageUrl: uploaded.url,
        contentDraftId,
        storage: uploaded.storage,
        durationMs,
    }
}
