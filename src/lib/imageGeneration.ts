/**
 * Fase 6: AI Image Generation via Google Gemini
 *
 * Menggunakan Google Gemini 2.0 Flash untuk text-to-image generation.
 * Model ini mampu generate gambar berdasarkan deskripsi teks detail.
 *
 * Cara kerja:
 * 1. Kirim image prompt ke Gemini API
 * 2. Gemini return inline base64 image data
 * 3. Decode base64 → Buffer → diteruskan ke Sharp untuk processing
 *
 * Kenapa Gemini untuk fashion brand?
 * - Support bahasa Indonesia dan pemahaman konteks lokal
 * - Content policy lebih fleksibel untuk fashion (flat lay, produk)
 * - Bisa di-tune dengan brand guidelines di system prompt
 */
import { GoogleGenerativeAI, type Part } from '@google/generative-ai'
import { env } from '../config/env.js'
import { logger } from './logger.js'

// Model yang mendukung image generation
// gemini-2.0-flash-preview-image-generation = Gemini 2.0 dengan kemampuan generate gambar
const IMAGE_GEN_MODEL = 'gemini-2.0-flash-preview-image-generation'

export interface ImageGenerationResult {
    buffer: Buffer
    mimeType: string // 'image/jpeg' atau 'image/png'
}

// System prompt yang di-inject ke setiap request untuk brand consistency
const BRAND_SYSTEM_INSTRUCTION = `
You are an AI image generator for "Nusantara Wear", an Indonesian fashion brand.

Visual brand guidelines:
- Style: Clean minimalist with Indonesian cultural touches
- Color palette: Earth tones — terracotta, sage green, cream, warm beige
- Lighting: Natural light, soft shadows, golden hour aesthetic
- Composition: Clean, uncluttered, product-focused
- Setting: Indonesian lifestyle context (cafe, garden, urban street)
- Model representation: Real-looking, confident, relatable (not runway model)
- Image format: Square 1:1 for feed, suitable for Instagram

Always produce high-quality, commercially usable fashion photography.
Avoid: explicit content, cultural misappropriation, unrealistic body standards.
`.trim()

/**
 * Generate fashion product image dari text prompt.
 *
 * Jika GEMINI_API_KEY tidak dikonfigurasi, throw error yang jelas.
 */
export async function generateFashionImage(
    imagePrompt: string
): Promise<ImageGenerationResult> {
    if (!env.GEMINI_API_KEY) {
        throw new Error(
            'GEMINI_API_KEY tidak dikonfigurasi. ' +
            'Set di .env untuk menggunakan AI image generation. ' +
            'Dapatkan gratis di: https://aistudio.google.com/apikey'
        )
    }

    logger.info({ promptPreview: imagePrompt.slice(0, 80) }, '🎨 Generating image with Gemini')

    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)

    const model = genAI.getGenerativeModel({
        model: IMAGE_GEN_MODEL,
        systemInstruction: BRAND_SYSTEM_INSTRUCTION,
    })

    const result = await model.generateContent({
        contents: [{
            role: 'user',
            parts: [{ text: imagePrompt }],
        }],
        generationConfig: {
            // Request model untuk return gambar
            // @ts-expect-error responseModalities is not yet in the type definitions
            responseModalities: ['IMAGE'],
            temperature: 0.8, // sedikit creative variance
        },
    })

    // Extract gambar dari response
    const candidate = result.response.candidates?.[0]
    if (!candidate?.content?.parts) {
        throw new Error('Gemini returned no image candidates')
    }

    for (const part of candidate.content.parts as Part[]) {
        if ('inlineData' in part && part.inlineData) {
            const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
            logger.info(
                { mimeType: part.inlineData.mimeType, sizeKB: Math.round(imageBuffer.length / 1024) },
                '🎨 Image generated'
            )
            return {
                buffer: imageBuffer,
                mimeType: part.inlineData.mimeType,
            }
        }
    }

    throw new Error('Gemini response did not contain image data')
}
