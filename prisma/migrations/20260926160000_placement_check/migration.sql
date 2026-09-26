-- CreateTable
CREATE TABLE "PlacementCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "results" JSONB,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlacementCheck_userId_topicId_createdAt_idx" ON "PlacementCheck"("userId", "topicId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlacementCheck" ADD CONSTRAINT "PlacementCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementCheck" ADD CONSTRAINT "PlacementCheck_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

