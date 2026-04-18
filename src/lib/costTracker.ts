import { logger } from './logger.js'

const PRICING = {
    'claude-opus-4-6': {
        inputPerMillion: 5.00,
        outputPerMillion: 25.00,
    },
    'claude-sonnet-4-6': {
        inputPerMillion: 3.00,
        outputPerMillion: 15.00,
    },
    'claude-haiku-4-5-20251001': {
        inputPerMillion: 1.00,
        outputPerMillion: 5.00,
    },
} as const

type TrackedModel = keyof typeof PRICING

let dailyCostUsd = 0
const DAILY_LIMIT_USD = 5.00

export interface TokenUsage {
	  model: string
	  inputTokens: number
		outputTokens: number
}

export function trackUsage(usage: TokenUsage): number {
	  const pricing = PRICING[usage.model as TrackedModel]

	  if (pricing === undefined) {
		    logger.warn({ model: usage.model }, 'Unknown model - cannot track cost')
				return 0
		}

		const cost =
	      (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
		    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion

		dailyCostUsd += cost

		logger.debug({
			  model: usage.model,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				costUsd: cost.toFixed(6),
				dailyTotalUsd: dailyCostUsd.toFixed(4),
		}, 'API usage tracked')

		if (dailyCostUsd >= DAILY_LIMIT_USD * 0.8) {
			  logger.warn({
		        dailyCostUsd: dailyCostUsd.toFixed(4),
				}, '⚠️ Approaching daily cost limit (80%)')
		}

		return cost
}

export function getDailyCost(): number {
	  return dailyCostUsd
}

export function resetDailyCost(): void {
	  logger.info({ finalCostUsd: dailyCostUsd.toFixed(4) }, 'Daily cost reset')
	  dailyCostUsd = 0
}
