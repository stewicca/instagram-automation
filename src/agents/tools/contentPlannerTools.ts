import { tool } from 'ai'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'

export const getPastPerformance = tool({
    description: `
        Ambil data performa konten Instagram yang sudah dipublish.
        Gunakan ini untuk memahami tipe konten apa yang paling engage
        di audience Nusantara Wear sebelum membuat rencana konten baru.
    `.trim(),
    inputSchema: z.object({
        limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(5)
            .describe('Jumlah konten teratas yang ingin diambil'),
        minEngagementRate: z
            .number()
            .min(0)
            .max(100)
            .default(0)
            .describe('Filter minimum engagement rate (persen)'),
    }),
    execute: async ({ limit, minEngagementRate }) => {
        logger.info({ limit, minEngagementRate }, '📊 Tool: getPastPerformance')

        try {
          const posts = await db.postAnalytics.findMany({
              where: {
                  engagementRate: { gte: minEngagementRate },
              },
              orderBy: { engagementRate: 'desc' },
              take: limit,
              include: {
                  contentDraft: {
                      select: {
                          caption: true,
                          contentPillar: true,
                          hashtags: true,
                          bestPostTime: true,
                      },
                  },
              },
          })

          if (posts.length === 0) {
              return {
                  found: false,
                  message: 'Belum ada data performa. Sistem baru berjalan.',
                  posts: [],
              }
          }

          return {
              found: true,
              totalAnalyzed: posts.length,
              posts: posts.map(p => ({
                  engagementRate: p.engagementRate,
                  likes: p.likes,
                  comments: p.comments,
                  saves: p.saves,
                  contentPillar: p.contentDraft.contentPillar,
                  captionPreview: p.contentDraft.caption.slice(0, 100),
                  bestPostTime: p.contentDraft.bestPostTime,
                  topHashtags: p.contentDraft.hashtags.slice(0, 5),
              })),
          }
        } catch (error) {
            logger.error({ error }, 'getPastPerformance failed')
            return {
                found: false,
                error: 'Gagal mengambil data performa dari database',
                posts: [],
            }
        }
    },
})

export const getScheduledContent = tool({
    description: `
        Cek konten yang sudah dijadwalkan untuk diterbitkan dalam N hari ke depan.
        Gunakan ini untuk menghindari duplikasi topik atau pillar yang sama
        saat merencanakan konten baru.
    `.trim(),
    inputSchema: z.object({
        daysAhead: z
            .number()
            .int()
            .min(1)
            .max(30)
            .default(7)
            .describe('Berapa hari ke depan yang ingin dicek'),
    }),
    execute: async ({ daysAhead }) => {
        logger.info({ daysAhead }, '📅 Tool: getScheduledContent')

        try {
            const until = new Date()
            until.setDate(until.getDate() + daysAhead)

            const scheduled = await db.contentDraft.findMany({
                where: {
                    status: { in: ['APPROVED', 'SCHEDULED'] },
                    scheduledAt: {
                        gte: new Date(),
                        lte: until,
                    },
                },
                select: {
                    contentPillar: true,
                    scheduledAt: true,
                    caption: true,
                },
                orderBy: { scheduledAt: 'asc' },
            })

            const pillarCount: Record<string, number> = {}
            for (const draft of scheduled) {
                const pillar = draft.contentPillar
                pillarCount[pillar] = (pillarCount[pillar] ?? 0) + 1
            }

            return {
                totalScheduled: scheduled.length,
                pillarDistribution: pillarCount,
                scheduledDates: scheduled.map(d => ({
                    date: d.scheduledAt?.toISOString().split('T')[0],
                    pillar: d.contentPillar,
                    preview: d.caption.slice(0, 60),
                })),
            }
        } catch (error) {
            logger.error({ error }, 'getScheduledContent failed')
            return {
                totalScheduled: 0,
                error: 'Gagal mengambil jadwal konten',
                pillarDistribution: {},
                scheduledDates: [],
            }
        }
    },
})

export const getRejectionInsights = tool({
    description: `
        Ambil insight dari konten yang pernah ditolak beserta alasan penolakannya.
        Gunakan ini untuk memahami pola konten yang TIDAK disukai brand owner,
        supaya konten baru tidak mengulangi kesalahan yang sama.
    `.trim(),
    inputSchema: z.object({
        limit: z
            .number()
            .int()
            .min(1)
            .max(10)
            .default(5)
            .describe('Jumlah contoh rejection yang ingin diambil'),
    }),
    execute: async ({ limit }) => {
        logger.info({ limit }, '❌ Tool: getRejectionInsights')

        try {
            const rejections = await db.rejectionFeedback.findMany({
                orderBy: { createdAt: 'desc' },
                take: limit,
                select: {
                    feedback: true,
                    caption: true,
                    createdAt: true,
                },
            })

            if (rejections.length === 0) {
                return {
                    found: false,
                    message: 'Belum ada data rejection. Semua konten diterima sejauh ini.',
                    patterns: [],
                }
            }

            return {
                found: true,
                totalRejections: rejections.length,
                patterns: rejections.map(r => ({
                    reason: r.feedback,
                    captionPreview: r.caption.slice(0, 80),
                    date: r.createdAt.toISOString().split('T')[0],
                })),
            }
        } catch (error) {
            logger.error({ error }, 'getRejectionInsights failed')
            return {
                found: false,
                error: 'Gagal mengambil data rejection',
                patterns: [],
            }
        }
    },
})

export const saveContentDraft = tool({
    description: `
        Simpan satu draft konten ke database dengan status PENDING_REVIEW.
        Gunakan ini setelah kamu yakin konten sudah sesuai brand voice
        dan tidak duplikat dengan konten yang sudah dijadwalkan.
        Tool ini hanya bisa dipanggil SEKALI PER KONTEN.
    `.trim(),
    inputSchema: z.object({
        caption: z
            .string()
            .min(10)
            .max(2200)
            .describe('Caption Instagram yang sudah final'),
        hashtags: z
            .array(z.string().startsWith('#'))
            .min(5)
            .max(30)
            .describe('Array hashtag, masing-masing harus dimulai dengan #'),
        imagePrompt: z
            .string()
            .min(20)
            .describe('Prompt untuk AI image generation, dalam bahasa Inggris'),
        contentPillar: z
            .enum(['EDUCATIONAL', 'PROMOTIONAL', 'LIFESTYLE', 'ENGAGEMENT', 'BEHIND_THE_SCENES'])
            .describe('Kategori konten sesuai content pillar Nusantara Wear'),
        bestPostTime: z
            .string()
            .describe('Waktu terbaik posting, contoh: Selasa 19:00 WIB'),
    }),
    execute: async ({ caption, hashtags, imagePrompt, contentPillar, bestPostTime }) => {
        logger.info({ contentPillar }, '💾 Tool: saveContentDraft')

        try {
            const draft = await db.contentDraft.create({
                data: {
                    caption,
                    hashtags,
                    imagePrompt,
                    contentPillar,
                    bestPostTime,
                },
            })

            logger.info({ draftId: draft.id }, 'Draft saved successfully')

            return {
                success: true,
                draftId: draft.id,
                status: draft.status,
                message: `Draft berhasil disimpan dengan ID: ${draft.id}. Menunggu review dari brand owner.`,
            }
        } catch (error) {
            logger.error({ error }, 'saveContentDraft failed')
            return {
                success: false,
                error: 'Gagal menyimpan draft ke database',
            }
        }
    },
})
