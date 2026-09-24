-- CreateTable
CREATE TABLE "CurriculumItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "url" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT NOT NULL DEFAULT '',
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurriculumItem_userId_topicId_order_idx" ON "CurriculumItem"("userId", "topicId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumItem_topicId_legacyId_key" ON "CurriculumItem"("topicId", "legacyId");

-- CreateIndex
CREATE INDEX "Resource_userId_topicId_order_idx" ON "Resource"("userId", "topicId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_topicId_legacyId_key" ON "Resource"("topicId", "legacyId");

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumItem" ADD CONSTRAINT "CurriculumItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

