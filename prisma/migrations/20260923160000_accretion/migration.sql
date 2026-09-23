-- Phase 8: accretion mode. Adds CaptureItem (3-second capture inbox), Note
-- (Zettelkasten-style linked notes), and NoteLink. Entirely additive — no
-- renames, no drops.

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('inbox', 'triaged', 'processed', 'archived');

-- CreateTable
CREATE TABLE "CaptureItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawText" TEXT,
    "url" TEXT,
    "title" TEXT,
    "sourceType" TEXT,
    "sourceAuthor" TEXT,
    "sourceMeta" JSONB,
    "highlight" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CaptureStatus" NOT NULL DEFAULT 'inbox',
    "processedAt" TIMESTAMP(3),
    "resultNoteId" TEXT,
    "resultConceptId" TEXT,
    "resultTopicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'permanent',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topicId" TEXT,
    "conceptId" TEXT,
    "skillId" TEXT,
    "sourceCaptureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'related',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaptureItem_userId_status_createdAt_idx" ON "CaptureItem"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Note_userId_updatedAt_idx" ON "Note"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_userId_topicId_idx" ON "Note"("userId", "topicId");

-- CreateIndex
CREATE INDEX "Note_userId_skillId_idx" ON "Note"("userId", "skillId");

-- CreateIndex
CREATE INDEX "Note_userId_tags_idx" ON "Note"("userId", "tags");

-- CreateIndex
CREATE INDEX "NoteLink_userId_toId_idx" ON "NoteLink"("userId", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteLink_fromId_toId_key" ON "NoteLink"("fromId", "toId");

-- AddForeignKey
ALTER TABLE "CaptureItem" ADD CONSTRAINT "CaptureItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_sourceCaptureId_fkey" FOREIGN KEY ("sourceCaptureId") REFERENCES "CaptureItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

