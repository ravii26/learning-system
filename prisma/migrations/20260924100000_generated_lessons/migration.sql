-- CreateTable
CREATE TABLE "GeneratedLesson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "moduleTitle" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedLesson_userId_topicId_idx" ON "GeneratedLesson"("userId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedLesson_topicId_moduleId_key" ON "GeneratedLesson"("topicId", "moduleId");

-- AddForeignKey
ALTER TABLE "GeneratedLesson" ADD CONSTRAINT "GeneratedLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedLesson" ADD CONSTRAINT "GeneratedLesson_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

