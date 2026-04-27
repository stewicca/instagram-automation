/**
 * Fase 6: Cloud Storage Abstraction
 *
 * Strategy pattern untuk storage:
 *   - 'local'  → simpan ke filesystem lokal (development)
 *   - 'r2'     → Cloudflare R2 (production — S3-compatible, murah)
 *   - 's3'     → AWS S3 (production — lebih widespread)
 *
 * Di development, file disimpan ke ./uploads/ dan diakses via localhost.
 * Di production, gunakan R2/S3 dengan CDN URL.
 *
 * Kenapa R2 direkomendasikan untuk fashion brand?
 * - Tidak ada egress fee (bandwidth keluar gratis)
 * - Harga storage sangat murah vs S3
 * - Compatible dengan S3 SDK — migrasi mudah
 */
import { promises as fs } from 'node:fs'
import { join, extname } from 'node:path'
import { env } from '../config/env.js'
import { logger } from './logger.js'

export interface UploadResult {
    url: string       // URL publik untuk diakses Instagram
    key: string       // Path/key di storage (untuk delete jika perlu)
    storage: string   // 'local' | 'r2' | 's3'
}

/**
 * Upload image buffer ke configured storage.
 * Returns public URL yang bisa dipakai sebagai imageUrl di ContentDraft.
 */
export async function uploadImage(params: {
    buffer: Buffer
    filename: string         // nama file tanpa path, contoh: 'draft-xxx-1.jpg'
    contentType?: string     // default: 'image/jpeg'
}): Promise<UploadResult> {
    const { buffer, filename, contentType = 'image/jpeg' } = params

    switch (env.UPLOAD_STORAGE) {
        case 'local':
            return uploadToLocal({ buffer, filename })

        case 'r2':
        case 's3':
            // Untuk R2/S3 production implementation, install @aws-sdk/client-s3
            // dan gunakan S3Client dengan credentials dari env.
            // R2 endpoint: https://<account-id>.r2.cloudflarestorage.com
            //
            // Contoh:
            // const client = new S3Client({ endpoint: env.R2_ENDPOINT, ... })
            // await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }))
            // return { url: `${env.UPLOAD_BASE_URL}/${filename}`, key: filename, storage: 'r2' }
            throw new Error(
                `${env.UPLOAD_STORAGE.toUpperCase()} storage belum dikonfigurasi. ` +
                'Install @aws-sdk/client-s3 dan set credentials di env. ' +
                'Gunakan UPLOAD_STORAGE=local untuk development.'
            )

        default:
            throw new Error(`Unknown storage type: ${env.UPLOAD_STORAGE}`)
    }
}

async function uploadToLocal(params: {
    buffer: Buffer
    filename: string
}): Promise<UploadResult> {
    const uploadDir = env.LOCAL_UPLOAD_PATH

    // Buat direktori jika belum ada
    await fs.mkdir(uploadDir, { recursive: true })

    const filePath = join(uploadDir, params.filename)
    await fs.writeFile(filePath, params.buffer)

    // URL untuk development — akses via HTTP server (Fase 8)
    const baseUrl = env.UPLOAD_BASE_URL ?? `http://localhost:${env.PORT}`
    const url = `${baseUrl}/uploads/${params.filename}`

    logger.info({ filePath, url, sizeKB: Math.round(params.buffer.length / 1024) }, '💾 Image saved locally')

    return {
        url,
        key: filePath,
        storage: 'local',
    }
}

/** Generate filename unik untuk upload */
export function generateImageFilename(contentDraftId: string, index = 0): string {
    return `draft-${contentDraftId}-${index}-${Date.now()}.jpg`
}
