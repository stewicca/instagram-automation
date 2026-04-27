import { db } from './db.js'
import { logger } from './logger.js'

export interface WorkingMemory {
	  stepResults: StepResult[]
	  decisions: Decision[]
	  contextAccumulated: Record<string, unknown>
}

export interface StepResult {
	  toolName: string
	  input: unknown
	  output: unknown
	  timestamp: string
}

export interface Decision {
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

export async function createAgentSession(
	  agentName: string,
	  jobId?: string
): Promise<AgentMemoryHandle> {
	  const session = await db.agentSession.create({
		    data: {
			      agentName,
			      jobId,
			      workingMemory: {
				        stepResults: [],
				        decisions: [],
				        contextAccumulated: {},
			      } satisfies WorkingMemory,
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
			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })

			      const mem = session.workingMemory as WorkingMemory
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

			      const mem = session.workingMemory as WorkingMemory
			      return mem.contextAccumulated[key] ?? null
		    },

		    async addStepResult(result) {
			      const session = await db.agentSession.findUniqueOrThrow({
				        where: { id: sessionId },
				        select: { workingMemory: true },
			      })

			      const mem = session.workingMemory as WorkingMemory
			      const updated: WorkingMemory = {
				        ...mem,
				        stepResults: [...mem.stepResults, result],
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

			      const mem = session.workingMemory as WorkingMemory
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
			      return session.workingMemory as WorkingMemory
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
