-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "lastResurfacedAt" TIMESTAMP(3),
ADD COLUMN     "resurfaceCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "rubricTemplate" TEXT;

