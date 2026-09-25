-- AlterTable
ALTER TABLE "Concept" ADD COLUMN     "answer" TEXT,
ADD COLUMN     "prompt" TEXT,
ADD COLUMN     "sourceKind" TEXT,
ADD COLUMN     "sourceModuleId" TEXT;

-- CreateTable
CREATE TABLE "ModuleAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "correct" INTEGER,
    "total" INTEGER,
    "verdict" TEXT,
    "answer" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "moduleId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "seconds" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "clientSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModuleAttempt_userId_topicId_moduleId_createdAt_idx" ON "ModuleAttempt"("userId", "topicId", "moduleId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyTimeEntry_userId_startedAt_idx" ON "StudyTimeEntry"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "StudyTimeEntry_userId_topicId_startedAt_idx" ON "StudyTimeEntry"("userId", "topicId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyTimeEntry_userId_clientSessionId_key" ON "StudyTimeEntry"("userId", "clientSessionId");

-- AddForeignKey
ALTER TABLE "ModuleAttempt" ADD CONSTRAINT "ModuleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleAttempt" ADD CONSTRAINT "ModuleAttempt_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTimeEntry" ADD CONSTRAINT "StudyTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTimeEntry" ADD CONSTRAINT "StudyTimeEntry_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

