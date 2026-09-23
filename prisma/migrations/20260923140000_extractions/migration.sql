-- Phase 5: extractions. Promotes Topic.sessionLogs / pauseHistory /
-- confusions / mistakes from JSON arrays into real tables (SessionLog,
-- TopicPause, Confusion, Mistake), and adds Topic.mode. Entirely additive —
-- no renames, no drops, no column type changes on existing tables. The old
-- JSON columns stay in place as generated mirrors (see
-- src/lib/sessionLogSync.ts and its siblings); unlike the ReviewLog rename
-- in Phase 3, nothing here needed hand-editing — this file is exactly what
-- `prisma migrate diff` produced.

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'syllabus';

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "whatDone" TEXT NOT NULL,
    "oneInsight" TEXT NOT NULL,
    "whatWasHard" TEXT NOT NULL,
    "nextAction" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "moduleId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicPause" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3) NOT NULL,
    "resumedAt" TIMESTAMP(3),
    "reason" TEXT,
    "completedConcepts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentConcept" TEXT,
    "openQuestion" TEXT,
    "reactivationScore" TEXT,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicPause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Confusion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "answer" TEXT,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Confusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "conceptId" TEXT,
    "conceptLabel" TEXT NOT NULL,
    "mistake" TEXT NOT NULL,
    "whyMade" TEXT,
    "correctUnderstanding" TEXT,
    "example" TEXT,
    "howToAvoid" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionLog_userId_topicId_timestamp_idx" ON "SessionLog"("userId", "topicId", "timestamp");

-- CreateIndex
CREATE INDEX "SessionLog_userId_timestamp_idx" ON "SessionLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "TopicPause_userId_topicId_pausedAt_idx" ON "TopicPause"("userId", "topicId", "pausedAt");

-- CreateIndex
CREATE INDEX "Confusion_userId_topicId_resolved_idx" ON "Confusion"("userId", "topicId", "resolved");

-- CreateIndex
CREATE INDEX "Mistake_userId_topicId_occurredAt_idx" ON "Mistake"("userId", "topicId", "occurredAt");

-- CreateIndex
CREATE INDEX "Mistake_userId_conceptId_idx" ON "Mistake"("userId", "conceptId");

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLog" ADD CONSTRAINT "SessionLog_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPause" ADD CONSTRAINT "TopicPause_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicPause" ADD CONSTRAINT "TopicPause_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confusion" ADD CONSTRAINT "Confusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Confusion" ADD CONSTRAINT "Confusion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

