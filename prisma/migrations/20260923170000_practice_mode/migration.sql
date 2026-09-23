-- CreateTable
CREATE TABLE "PracticeRep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "promptConceptId" TEXT,
    "rubricScores" JSONB NOT NULL,
    "invertedKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" DOUBLE PRECISION NOT NULL,
    "recordingUrl" TEXT,
    "transcript" TEXT,
    "aiFeedback" TEXT,
    "durationSeconds" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeRep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "kind" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeRep_userId_topicId_occurredAt_idx" ON "PracticeRep"("userId", "topicId", "occurredAt");

-- CreateIndex
CREATE INDEX "PracticeRep_userId_occurredAt_idx" ON "PracticeRep"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Artifact_userId_topicId_occurredAt_idx" ON "Artifact"("userId", "topicId", "occurredAt");

-- AddForeignKey
ALTER TABLE "PracticeRep" ADD CONSTRAINT "PracticeRep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRep" ADD CONSTRAINT "PracticeRep_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRep" ADD CONSTRAINT "PracticeRep_promptConceptId_fkey" FOREIGN KEY ("promptConceptId") REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

