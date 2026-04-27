-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "jobId" TEXT,
    "workingMemory" JSONB NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "contentDraftId" TEXT,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_agentName_status_idx" ON "AgentSession"("agentName", "status");

-- CreateIndex
CREATE INDEX "AgentSession_jobId_idx" ON "AgentSession"("jobId");

-- CreateIndex
CREATE INDEX "AgentSession_startedAt_idx" ON "AgentSession"("startedAt");
