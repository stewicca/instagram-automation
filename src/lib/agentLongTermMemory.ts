import { db } from './db.js'

export interface ContentInsight {
	  pillar: string
	  avgEngagementRate: number
	  totalPosts: number
	  bestPostTime: string | null
	  topHashtags: string[]
}

export interface RejectionPattern {
	  reason: string
	  count: number
	  examples: string[]
}

export interface BrandKnowledge {
	  recentInsights: ContentInsight[]
	  rejectionPatterns: RejectionPattern[]
	  lastUpdated: string
}

export async function getContentInsights(
  	limit = 5
): Promise<ContentInsight[]> {
	  const drafts = await db.contentDraft.findMany({
		    where: {
			      status: 'PUBLISHED',
			      analytics: { isNot: null },
		    },
		    include: { analytics: true },
		    orderBy: { publishedAt: 'desc' },
		    take: 50,
	  })

	  const byPillar = new Map<string, {
		    total: number
		    totalEngagement: number
		    postTimes: string[]
		    hashtags: string[]
	  }>()

	  for (const draft of drafts) {
		    const pillar = draft.contentPillar
		    const engagement = draft.analytics?.engagementRate ?? 0
		    const existing = byPillar.get(pillar) ?? {
			      total: 0,
			      totalEngagement: 0,
			      postTimes: [],
			      hashtags: [],
		    }

		    byPillar.set(pillar, {
			      total: existing.total + 1,
			      totalEngagement: existing.totalEngagement + engagement,
			      postTimes: [
				        ...existing.postTimes,
				        ...(draft.bestPostTime ? [draft.bestPostTime] : []),
			      ],
			      hashtags: [...existing.hashtags, ...draft.hashtags],
		    })
	  }

	  return Array.from(byPillar.entries())
		    .map(([pillar, data]) => ({
			      pillar,
			      avgEngagementRate: data.total > 0
				        ? data.totalEngagement / data.total
				        : 0,
			      totalPosts: data.total,
			      bestPostTime: mostFrequent(data.postTimes),
			      topHashtags: topN(data.hashtags, 5),
		    }))
		    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
		    .slice(0, limit)
}

export async function getRejectionPatterns(): Promise<RejectionPattern[]> {
	  const feedbacks = await db.rejectionFeedback.findMany({
		    where: { usedAsExample: false },
		    orderBy: { createdAt: 'desc' },
		    take: 30,
		    select: {
			      feedback: true,
			      caption: true,
		    },
	  })

	  if (feedbacks.length === 0) return []

	  const patterns = new Map<string, { count: number; examples: string[] }>()

	  for (const fb of feedbacks) {
		    const key = extractPatternKey(fb.feedback)
		    const existing = patterns.get(key) ?? { count: 0, examples: [] }
		    patterns.set(key, {
			      count: existing.count + 1,
			      examples: [
				        ...existing.examples,
				        fb.caption.slice(0, 80),
			      ].slice(0, 3),
		    })
	  }

	  return Array.from(patterns.entries())
		    .map(([reason, data]) => ({
			      reason,
			      count: data.count,
			      examples: data.examples,
		    }))
		    .sort((a, b) => b.count - a.count)
}

export async function getBrandKnowledge(): Promise<BrandKnowledge> {
	  const [insights, patterns] = await Promise.all([
		    getContentInsights(),
		    getRejectionPatterns(),
	  ])

	  return {
		    recentInsights: insights,
		    rejectionPatterns: patterns,
		    lastUpdated: new Date().toISOString(),
	  }
}

function mostFrequent(arr: string[]): string | null {
	  if (arr.length === 0) return null
	  const freq = new Map<string, number>()
	  for (const item of arr) freq.set(item, (freq.get(item) ?? 0) + 1)
	  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function topN(arr: string[], n: number): string[] {
	  const freq = new Map<string, number>()
	  for (const item of arr) freq.set(item, (freq.get(item) ?? 0) + 1)
	  return [...freq.entries()]
		    .sort((a, b) => b[1] - a[1])
		    .slice(0, n)
		    .map(([item]) => item)
}

function extractPatternKey(reason: string): string {
	  const lower = reason.toLowerCase()
	  if (lower.includes('formal') || lower.includes('kaku')) return 'terlalu formal'
	  if (lower.includes('panjang') || lower.includes('verbose')) return 'caption terlalu panjang'
	  if (lower.includes('produk') || lower.includes('salah produk')) return 'produk tidak relevan'
	  if (lower.includes('hashtag')) return 'hashtag kurang relevan'
	  return reason.slice(0, 50)
}
