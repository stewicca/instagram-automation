-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentPillar" AS ENUM ('EDUCATIONAL', 'PROMOTIONAL', 'LIFESTYLE', 'ENGAGEMENT', 'BEHIND_THE_SCENES');

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "imagePrompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "contentPillar" "ContentPillar" NOT NULL,
    "bestPostTime" TEXT,
    "feedback" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "instagramPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostAnalytics" (
    "id" TEXT NOT NULL,
    "contentDraftId" TEXT NOT NULL,
    "instagramPostId" TEXT NOT NULL,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boosted" BOOLEAN NOT NULL DEFAULT false,
    "adsCampaignId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RejectionFeedback" (
    "id" TEXT NOT NULL,
    "contentDraftId" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "usedAsExample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentDraft_status_idx" ON "ContentDraft"("status");

-- CreateIndex
CREATE INDEX "ContentDraft_scheduledAt_idx" ON "ContentDraft"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostAnalytics_contentDraftId_key" ON "PostAnalytics"("contentDraftId");

-- CreateIndex
CREATE INDEX "PostAnalytics_instagramPostId_idx" ON "PostAnalytics"("instagramPostId");

-- CreateIndex
CREATE INDEX "PostAnalytics_engagementRate_idx" ON "PostAnalytics"("engagementRate");

-- CreateIndex
CREATE INDEX "RejectionFeedback_usedAsExample_idx" ON "RejectionFeedback"("usedAsExample");

-- CreateIndex
CREATE INDEX "JobLog_jobName_idx" ON "JobLog"("jobName");

-- CreateIndex
CREATE INDEX "JobLog_status_idx" ON "JobLog"("status");

-- CreateIndex
CREATE INDEX "JobLog_createdAt_idx" ON "JobLog"("createdAt");

-- AddForeignKey
ALTER TABLE "PostAnalytics" ADD CONSTRAINT "PostAnalytics_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "ContentDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
