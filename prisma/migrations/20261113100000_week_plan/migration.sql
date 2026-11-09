-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "focusItemId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanEntry_userId_day_idx" ON "PlanEntry"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntry_focusItemId_day_key" ON "PlanEntry"("focusItemId", "day");

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_focusItemId_fkey" FOREIGN KEY ("focusItemId") REFERENCES "FocusItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

