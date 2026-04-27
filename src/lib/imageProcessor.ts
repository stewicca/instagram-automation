/**
 * Fase 6: Image Processing dengan Sharp
 *
 * Sharp adalah library Node.js tercepat untuk image processing.
 * Gunakan untuk: resize, crop, format convert, watermark, composite.
 *
 * Pipeline untuk Instagram:
 *   raw image
 *     → resize ke 1080x1080 (feed) atau 1080x1350 (portrait 4:5)
 *     → tambah watermark logo brand (pojok kanan bawah, opacity 70%)
 *     → convert ke JPEG quality 90 (Instagram optimal)
 *     → return Buffer siap upload
 */
import sharp from 'sharp'
import { logger } from './logger.js'

// Format Instagram yang didukung
export type InstagramFormat = 'square' | 'portrait' | 'landscape'

const FORMAT_DIMENSIONS: Record<InstagramFormat, { width: number; height: number }> = {
    square: { width: 1080, height: 1080 },     // 1:1 — feed standar
    portrait: { width: 1080, height: 1350 },   // 4:5 — optimal untuk feed (lebih besar di layar)
    landscape: { width: 1080, height: 566 },   // 1.91:1 — landscape
}

export interface ProcessImageOptions {
    format?: InstagramFormat
    quality?: number       // JPEG quality 1-100, default 90
    addWatermark?: boolean // default true
    brandName?: string     // text watermark, default 'NUSANTARA WEAR'
}

/**
 * Process gambar untuk siap upload ke Instagram.
 *
 * @param input - Buffer dari Gemini atau URL gambar
 * @param options - Format, quality, watermark options
 * @returns Buffer JPEG siap upload
 */
export async function processForInstagram(
    input: Buffer | string,
    options: ProcessImageOptions = {}
): Promise<Buffer> {
    const {
        format = 'square',
        quality = 90,
        addWatermark = true,
        brandName = 'NUSANTARA WEAR',
    } = options

    const { width, height } = FORMAT_DIMENSIONS[format]

    logger.info({ format, width, height, quality, addWatermark }, '📐 Processing image for Instagram')

    // Load gambar
    let pipeline = sharp(input)

    // Resize ke dimensi Instagram dengan cover fit
    // 'cover' = crop gambar agar memenuhi dimensi tanpa distorsi
    pipeline = pipeline.resize(width, height, {
        fit: 'cover',
        position: 'center',
    })

    // Tambah watermark jika diminta
    if (addWatermark) {
        const watermarkSvg = createWatermarkSvg(brandName, width)
        pipeline = pipeline.composite([{
            input: Buffer.from(watermarkSvg),
            gravity: 'southeast', // pojok kanan bawah
            blend: 'over',
        }])
    }

    // Convert ke JPEG dengan quality yang baik
    const result = await pipeline
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

    logger.info(
        { outputSizeKB: Math.round(result.length / 1024), format },
        '📐 Image processed'
    )

    return result
}

/**
 * Generate SVG watermark teks untuk brand.
 * SVG dipilih karena scalable dan tidak butuh asset file eksternal.
 */
function createWatermarkSvg(text: string, imageWidth: number): string {
    const fontSize = Math.round(imageWidth * 0.025)  // 2.5% dari lebar gambar
    const padding = Math.round(imageWidth * 0.02)

    // Ukuran rough watermark (akan diclip oleh SVG viewBox)
    const svgWidth = text.length * fontSize * 0.6 + padding * 2
    const svgHeight = fontSize + padding * 2

    return `
<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${svgWidth}" height="${svgHeight}" fill="rgba(0,0,0,0.35)" rx="4"/>
  <text
    x="${svgWidth / 2}"
    y="${svgHeight / 2 + fontSize * 0.35}"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="600"
    letter-spacing="2"
    fill="rgba(255,255,255,0.85)"
  >${text}</text>
</svg>`.trim()
}

/**
 * Ambil metadata gambar (width, height, format).
 * Berguna untuk validasi sebelum processing.
 */
export async function getImageMetadata(input: Buffer | string): Promise<{
    width?: number
    height?: number
    format?: string
    sizeKB: number
}> {
    const buffer = typeof input === 'string'
        ? await sharp(input).toBuffer()
        : input

    const meta = await sharp(buffer).metadata()

    return {
        width: meta.width,
        height: meta.height,
        format: meta.format,
        sizeKB: Math.round(buffer.length / 1024),
    }
}
