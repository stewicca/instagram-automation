/**
 * Fase 6: AI Image Generation Demo
 *
 * Jalankan: npx tsx src/agents/experiments/imageGenerationDemo.ts
 *
 * Yang kamu pelajari:
 * 1. Gemini API untuk text-to-image generation
 * 2. Sharp untuk resize ke format Instagram + tambah watermark
 * 3. Storage abstraction (local dev → R2/S3 production)
 * 4. Full pipeline: prompt → gambar → proses → upload → URL
 *
 * Prerequisites:
 *   GEMINI_API_KEY=AIza... (dari https://aistudio.google.com/apikey — gratis)
 *   UPLOAD_STORAGE=local
 */
import { generateFashionImage } from '../../lib/imageGeneration.js'
import { processForInstagram, getImageMetadata } from '../../lib/imageProcessor.js'
import { uploadImage, generateImageFilename } from '../../lib/cloudStorage.js'
import { env } from '../../config/env.js'
import { promises as fs } from 'node:fs'

const HAS_GEMINI = Boolean(env.GEMINI_API_KEY)

async function demo1GeminiImageGeneration(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 1: Gemini Image Generation')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (!HAS_GEMINI) {
        console.log('\n⚠️  GEMINI_API_KEY tidak dikonfigurasi')
        console.log('   Dapatkan gratis di: https://aistudio.google.com/apikey')
        console.log('   Tambahkan ke .env: GEMINI_API_KEY=AIza...\n')
        console.log('Demo akan menampilkan contoh prompt saja.\n')

        const examplePrompt = `
A flat-lay product shot of a modern batik kemeja (Indonesian batik shirt) in slim-fit style.
Color: indigo and cream batik pattern with geometric motifs.
Setting: minimalist wooden surface with green tropical leaves accent.
Lighting: natural daylight from the side, soft shadows.
Color palette: earth tones, terracotta, cream, deep indigo.
Style: editorial fashion photography, clean composition.
Camera angle: directly overhead, perfectly centered.
`.trim()

        console.log('Contoh Image Prompt (dari Image Prompt Agent):')
        console.log('─────────────────────────────────────────')
        console.log(examplePrompt)
        console.log('─────────────────────────────────────────')
        return
    }

    const prompt = `
A flat-lay product shot of a modern batik kemeja in slim-fit style.
Indigo and cream batik pattern with geometric Javanese motifs.
Minimalist wooden surface background with subtle green leaf accents.
Natural daylight, soft shadows, clean editorial style.
`.trim()

    console.log('\nGenerating image...')
    const result = await generateFashionImage(prompt)

    console.log(`✅ Generated: ${result.mimeType}, ${Math.round(result.buffer.length / 1024)}KB`)
    return
}

async function demo2SharpProcessing(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 2: Sharp Image Processing')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nFormat Instagram yang didukung:')
    console.log('  square    → 1080x1080 (1:1) — feed standar')
    console.log('  portrait  → 1080x1350 (4:5) — mengisi lebih banyak layar, engagement lebih tinggi')
    console.log('  landscape → 1080x566  (1.91:1) — jarang dipakai untuk produk')
    console.log()
    console.log('Processing steps:')
    console.log('  1. Resize dengan "cover" fit → tidak ada distorsi, crop otomatis')
    console.log('  2. Composite watermark SVG di pojok kanan bawah (opacity 70%)')
    console.log('  3. Convert ke JPEG quality 90 dengan mozjpeg compression')
    console.log()

    // Demo dengan gambar test (buat gradient solid color sebagai input)
    const { default: sharp } = await import('sharp')

    // Buat test image: gradient merah-kuning (simulating raw Gemini output)
    const testInput = await sharp({
        create: {
            width: 1200,
            height: 900,
            channels: 3,
            background: { r: 180, g: 120, b: 80 }, // warm terracotta
        }
    }).jpeg().toBuffer()

    console.log(`Input test image: 1200x900, ${Math.round(testInput.length / 1024)}KB`)

    const processed = await processForInstagram(testInput, {
        format: 'square',
        quality: 90,
        addWatermark: true,
        brandName: 'NUSANTARA WEAR',
    })

    const meta = await getImageMetadata(processed)
    console.log(`\nOutput after processing:`)
    console.log(`  Size   : ${meta.width}x${meta.height}px`)
    console.log(`  Format : ${meta.format}`)
    console.log(`  File   : ${meta.sizeKB}KB`)
    console.log('  ✓ Resized to 1080x1080')
    console.log('  ✓ Watermark added')
    console.log('  ✓ Converted to JPEG 90%')

    // Simpan ke uploads untuk bisa dilihat
    await fs.mkdir('./uploads', { recursive: true })
    await fs.writeFile('./uploads/demo-processed.jpg', processed)
    console.log('\n  💾 Saved to ./uploads/demo-processed.jpg')
}

async function demo3StorageUpload(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 3: Cloud Storage Abstraction')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log('\nStorage strategy pattern:')
    console.log('  UPLOAD_STORAGE=local → ./uploads/ (dev)')
    console.log('  UPLOAD_STORAGE=r2    → Cloudflare R2 (production)')
    console.log('  UPLOAD_STORAGE=s3    → AWS S3 (production)')
    console.log()
    console.log(`Current storage: ${env.UPLOAD_STORAGE}`)

    if (env.UPLOAD_STORAGE === 'local') {
        console.log()

        // Upload test buffer
        const { default: sharp } = await import('sharp')
        const testBuffer = await sharp({
            create: { width: 100, height: 100, channels: 3, background: { r: 180, g: 120, b: 80 } }
        }).jpeg().toBuffer()

        const filename = generateImageFilename('demo-draft')
        const result = await uploadImage({
            buffer: testBuffer,
            filename,
            contentType: 'image/jpeg',
        })

        console.log('✅ Uploaded to local storage:')
        console.log(`   Key    : ${result.key}`)
        console.log(`   URL    : ${result.url}`)
        console.log(`   Storage: ${result.storage}`)
        console.log()
        console.log('⚠️  Catatan untuk production:')
        console.log('   URL lokal tidak bisa diakses Instagram (butuh public URL)')
        console.log('   Gunakan: ngrok (dev testing) atau R2/S3 (production)')
    }
}

async function demo4FullPipeline(): Promise<void> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Demo 4: Full Pipeline Summary')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    console.log(`
Full image generation pipeline:

  ContentDraft (dari generateContent job)
      │
      │ imagePrompt = "A flat-lay batik shirt..."
      ↓
  generateImage job (BullMQ)
      │
      ├── generateFashionImage(imagePrompt)
      │     └── Gemini API → raw Buffer (~500KB)
      │
      ├── processForInstagram(buffer, { format: 'square' })
      │     ├── Sharp: resize 1080x1080
      │     ├── Sharp: composite watermark SVG
      │     └── Sharp: JPEG quality 90 (~150KB)
      │
      ├── uploadImage({ buffer, filename })
      │     └── Local (dev): saves to ./uploads/
      │         R2/S3 (prod): uploads to CDN
      │
      └── db.contentDraft.update({ imageUrl: uploaded.url })
            └── ContentDraft ready for review!

Untuk publish ke Instagram:
  ContentDraft.imageUrl harus URL publik
  Dev: gunakan ngrok → expose localhost ke internet
       npx ngrok http 3000
       Update UPLOAD_BASE_URL=https://xxxx.ngrok.io
`)
}

async function main(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗')
    console.log('║  Fase 6: AI Image Generation Demo                 ║')
    console.log('╚══════════════════════════════════════════════════╝')

    await demo1GeminiImageGeneration()
    await demo2SharpProcessing()
    await demo3StorageUpload()
    await demo4FullPipeline()

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Demo selesai!')
    console.log()
    console.log('Key Takeaways:')
    console.log('  1. Gemini API = text-to-image via Google AI Studio (gratis tier ada)')
    console.log('  2. Sharp = fastest Node.js image processing, zero config')
    console.log('  3. Storage abstraction → dev pakai local, production pakai CDN')
    console.log('  4. URL gambar HARUS publik untuk di-publish ke Instagram')
    console.log()
    console.log('Selanjutnya → Fase 7: Meta Ads API')
}

main().catch(err => {
    console.error('Demo error:', err)
    process.exit(1)
})
