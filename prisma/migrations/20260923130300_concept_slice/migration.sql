-- Phase 3: the Concept slice.
--
-- The old ReviewLog (weekly-audit snapshot: {topicId, title, decision}[])
-- is renamed to ReviewSession, NOT dropped and recreated, so its 2 existing
-- rows survive. Prisma's own diff (`prisma migrate diff`) does not detect
-- this as a rename — it sees "a table named ReviewLog with different
-- columns" and emits ALTER TABLE ReviewLog DROP COLUMN topicsReviewed,
-- which both loses the column's data and leaves the new NOT NULL columns
-- (grade, conceptId, ...) with no values to populate on the 2 existing
-- rows. That generated SQL was reviewed and rejected; this migration
-- replaces it by hand.

-- CreateEnum
CREATE TYPE "MasteryLevel" AS ENUM ('Unknown', 'Exposed', 'Understood', 'CanRecall', 'CanApply', 'CanSolve', 'CanExplain', 'CanTeach', 'CanCreate');

-- CreateEnum
CREATE TYPE "FsrsState" AS ENUM ('New', 'Learning', 'Review', 'Relearning');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('Again', 'Hard', 'Good', 'Easy');

-- Rename ReviewLog -> ReviewSession, table + constraints, preserving rows.
ALTER TABLE "ReviewLog" RENAME TO "ReviewSession";
ALTER TABLE "ReviewSession" RENAME CONSTRAINT "ReviewLog_pkey" TO "ReviewSession_pkey";
ALTER TABLE "ReviewSession" RENAME CONSTRAINT "ReviewLog_userId_fkey" TO "ReviewSession_userId_fkey";

-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "masteryLevel" "MasteryLevel" NOT NULL DEFAULT 'Unknown',
    "difficultyTag" TEXT,
    "importance" TEXT,
    "state" "FsrsState" NOT NULL DEFAULT 'New',
    "stability" DOUBLE PRECISION,
    "difficulty" DOUBLE PRECISION,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReview" TIMESTAMP(3),
    "nextReview" TIMESTAMP(3),
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "legacyId" TEXT,
    "seededFromLegacy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'related',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptLink_pkey" PRIMARY KEY ("id")
);

-- Fresh CreateTable for the new per-concept ReviewLog (the name is free now
-- that the old table has been renamed to ReviewSession above).
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" "Grade" NOT NULL,
    "stateBefore" "FsrsState" NOT NULL,
    "stateAfter" "FsrsState" NOT NULL,
    "stabilityBefore" DOUBLE PRECISION,
    "stabilityAfter" DOUBLE PRECISION,
    "difficultyAfter" DOUBLE PRECISION,
    "elapsedDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "nextReview" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Concept_userId_suspended_nextReview_idx" ON "Concept"("userId", "suspended", "nextReview");

-- CreateIndex
CREATE INDEX "Concept_userId_topicId_masteryLevel_idx" ON "Concept"("userId", "topicId", "masteryLevel");

-- CreateIndex
CREATE INDEX "Concept_topicId_legacyId_idx" ON "Concept"("topicId", "legacyId");

-- CreateIndex
CREATE INDEX "ConceptLink_userId_toId_idx" ON "ConceptLink"("userId", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "ConceptLink_fromId_toId_kind_key" ON "ConceptLink"("fromId", "toId", "kind");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_reviewedAt_idx" ON "ReviewLog"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ReviewLog_conceptId_reviewedAt_idx" ON "ReviewLog"("conceptId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptLink" ADD CONSTRAINT "ConceptLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptLink" ADD CONSTRAINT "ConceptLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptLink" ADD CONSTRAINT "ConceptLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE CASCADE ON UPDATE CASCADE;
