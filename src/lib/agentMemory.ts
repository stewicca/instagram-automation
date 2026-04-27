import { db } from './db.js'
import { logger } from './logger.js'
import type { Prisma } from '../generated/prisma/client.js'

export interface WorkingMemory {
	  [key: string]: Prisma.JsonValue
	  stepResults: StoredStepResult[]
	  decisions: Decision[]
	  contextAccumulated: Record<string, Prisma.JsonValue>
}

export interface StepResult {
	  toolName: string
	  input: unknown
	  output: unknown
	  timestamp: string
}

export interface Decision {
	  [key: string]: Prisma.JsonValue
	  reasoning: string
	  decided: string
	  timestamp: string
}

export interface AgentMemoryHandle {
	  sessionId: string
	  agentName: string
	  remember(key: string, value: unknown): Promise<void>
	  recall(key: string): Promise<unknown | null>
	  addStepResult(result: StepResult): Promise<void>
	  addDecision(decision: Decision): Promise<void>
	  getWorkingMemory(): Promise<WorkingMemory>
	  complete(contentDraftId?: string): Promise<void>
	  fail(error: string): Promise<void>
}

interface StoredStepResult {
	  [key: string]: Prisma.JsonValue
	  toolName: string
	  input: Prisma.JsonValue
	  output: Prisma.JsonValue
	  timestamp: string
}

export async function createAgentSession(
	  agentName: string,
	  jobId?: string
): Promise<AgentMemoryHandle> {
	  const initialMemory: WorkingMemory = {
		    stepResults: [],
		    decisions: [],
		    contextAccumulated: {},
	  }

	  const session = await db.agentSession.create({
		    data: {
			      agentName,
			      jobId: jobId ?? null,
			      workingMemory: initialMemory,
		    },
	  })

	  logger.info({ sessionId: session.id, agentName }, '🧠 Agent session created')

	  return buildHandle(session.id, agentName)
}

export async function resumeAgentSession(
  	sessionId: string
): Promise<AgentMemoryHandle | null> {
	  const session = await db.agentSession.findUnique({
		    where: { id: sessionId },
	  })

	  if (!session) return null

	  logger.info({ sessionId, agentName: session.agentName }, '🧠 Agent session resumed')
	  return buildHandle(session.id, session.agentName)
}

function buildHandle(sessionId: string, agentName: string): AgentMemoryHandle {
	  return {
		    sessionId,
		    agentName,

		    async remember(key, value) {
			      if (!isJsonValue(value)) {
				        throw new TypeError(`remember("${key}") only accepts JSON-serializable values`)
			      }

			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })

			      const mem = asWorkingMemory(session.workingMemory)
			      const updated: WorkingMemory = {
				        ...mem,
				        contextAccumulated: {
					          ...mem.contextAccumulated,
					          [key]: value,
				        },
			      }

			      await db.agentSession.update({
				        where: { id: sessionId },
				        data: { workingMemory: updated },
			      })
		    },

		    async recall(key) {
			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })

			      const mem = asWorkingMemory(session.workingMemory)
			      return mem.contextAccumulated[key] ?? null
		    },

		    async addStepResult(result) {
			      if (!isJsonValue(result.input) || !isJsonValue(result.output)) {
				        throw new TypeError('addStepResult only accepts JSON-serializable input/output')
			      }

			      const stored: StoredStepResult = {
				        ...result,
				        input: result.input,
				        output: result.output,
			      }

			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })

			      const mem = asWorkingMemory(session.workingMemory)
			      const updated: WorkingMemory = {
				        ...mem,
				        stepResults: [...mem.stepResults, stored],
			      }

			      await db.agentSession.update({
				        where: { id: sessionId },
				        data: { workingMemory: updated },
			      })
		    },

		    async addDecision(decision) {
			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })

			      const mem = asWorkingMemory(session.workingMemory)
			      const updated: WorkingMemory = {
				        ...mem,
				        decisions: [...mem.decisions, decision],
			      }

			      await db.agentSession.update({
				        where: { id: sessionId },
				        data: { workingMemory: updated },
			      })
		    },

		    async getWorkingMemory() {
			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })
			      return asWorkingMemory(session.workingMemory)
		    },

		    async complete(contentDraftId) {
			      await db.agentSession.update({
				        where: { id: sessionId },
				        data: {
					          status: 'COMPLETED',
					          completedAt: new Date(),
					          ...(contentDraftId !== undefined && { contentDraftId }),
				        },
			      })
			      logger.info({ sessionId, agentName }, '🧠 Agent session completed')
		    },

		    async fail(errorMessage) {
			      await db.agentSession.update({
				        where: { id: sessionId },
				        data: {
					          status: 'FAILED',
					          completedAt: new Date(),
					          errorMessage,
				        },
			      })
			      logger.warn({ sessionId, agentName, errorMessage }, '🧠 Agent session failed')
		    },
	  }
}

function asWorkingMemory(value: Prisma.JsonValue): WorkingMemory {
	  if (!isWorkingMemory(value)) {
		    throw new TypeError('Agent session workingMemory has invalid shape')
	  }
	  return value
}

function isWorkingMemory(value: Prisma.JsonValue): value is WorkingMemory {
	  if (!isJsonObject(value)) return false
	  if (!Array.isArray(value.stepResults) || !value.stepResults.every(isStepResult)) return false
	  if (!Array.isArray(value.decisions) || !value.decisions.every(isDecision)) return false
	  return value.contextAccumulated !== undefined && isJsonObject(value.contextAccumulated)
}

function isStepResult(value: Prisma.JsonValue): value is StoredStepResult {
	  if (!isJsonObject(value)) return false
	  return (
		    typeof value.toolName === 'string' &&
		    typeof value.timestamp === 'string' &&
		    isJsonValue(value.input) &&
		    isJsonValue(value.output)
	  )
}

function isDecision(value: Prisma.JsonValue): value is Decision {
	  if (!isJsonObject(value)) return false
	  return (
		    typeof value.reasoning === 'string' &&
		    typeof value.decided === 'string' &&
		    typeof value.timestamp === 'string'
	  )
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
	  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is Prisma.JsonValue {
	  if (
		    value === null ||
		    typeof value === 'string' ||
		    typeof value === 'number' ||
		    typeof value === 'boolean'
	  ) {
		    return true
	  }

	  if (Array.isArray(value)) {
		    return value.every(isJsonValue)
	  }

	  if (typeof value === 'object') {
		    return Object.values(value as Record<string, unknown>).every(isJsonValue)
	  }

	  return false
}
