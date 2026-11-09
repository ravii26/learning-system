-- AlterTable
ALTER TABLE "User" ADD COLUMN     "focusSetupAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FocusItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "goalId" TEXT,
    "topicId" TEXT,
    "moduleId" TEXT,
    "title" TEXT,
    "rhythm" TEXT NOT NULL DEFAULT 'few_weekly',
    "targetDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "skippedDay" TEXT,
    "addedDay" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FocusItem_userId_completedAt_idx" ON "FocusItem"("userId", "completedAt");

-- AddForeignKey
ALTER TABLE "FocusItem" ADD CONSTRAINT "FocusItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusItem" ADD CONSTRAINT "FocusItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusItem" ADD CONSTRAINT "FocusItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

