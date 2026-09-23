-- Phase 7: Goals. Adds Goal (a user-stated outcome an AI roadmap
-- decomposes into) and GoalLink (the join to the Topics/Skills that serve
-- it). Entirely additive — no renames, no drops.

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('draft', 'active', 'achieved', 'abandoned', 'paused');

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "why" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "targetDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "achievedAt" TIMESTAMP(3),
    "readinessMet" INTEGER NOT NULL DEFAULT 0,
    "readinessTotal" INTEGER NOT NULL DEFAULT 0,
    "readinessAt" TIMESTAMP(3),
    "readinessBreakdown" JSONB,
    "roadmapRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "topicId" TEXT,
    "skillId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GoalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_userId_status_targetDate_idx" ON "Goal"("userId", "status", "targetDate");

-- CreateIndex
CREATE INDEX "GoalLink_userId_goalId_order_idx" ON "GoalLink"("userId", "goalId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GoalLink_goalId_topicId_key" ON "GoalLink"("goalId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalLink_goalId_skillId_key" ON "GoalLink"("goalId", "skillId");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalLink" ADD CONSTRAINT "GoalLink_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

