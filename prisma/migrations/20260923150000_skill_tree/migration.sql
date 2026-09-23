-- Phase 6: the Skill tree. Adds Skill (self-referencing Area -> Skill ->
-- sub-skill) and Topic.skillId. Entirely additive — no renames, no drops.
-- Topic.area is untouched; skillId is additive alongside it, not a
-- replacement (the plan's original design called the old column
-- "areaLegacy", but renaming a column every route and component reads
-- would be a much bigger change than this phase needs).

-- CreateEnum
CREATE TYPE "SkillKind" AS ENUM ('area', 'skill', 'subskill');

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "skillId" TEXT;

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "SkillKind" NOT NULL DEFAULT 'skill',
    "parentId" TEXT,
    "path" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "depth" INTEGER NOT NULL DEFAULT 0,
    "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "masteryLevel" "MasteryLevel" NOT NULL DEFAULT 'Unknown',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvidenceAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3),
    "masteryBreakdown" JSONB,
    "targetLevel" "MasteryLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Skill_userId_parentId_idx" ON "Skill"("userId", "parentId");

-- CreateIndex
CREATE INDEX "Skill_userId_kind_idx" ON "Skill"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_userId_slug_key" ON "Skill"("userId", "slug");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

