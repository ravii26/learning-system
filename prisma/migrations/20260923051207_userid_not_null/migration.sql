/*
  Warnings:

  - Made the column `userId` on table `ActivityLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `ReviewLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `Topic` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ActivityLog" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ReviewLog" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Topic" ALTER COLUMN "userId" SET NOT NULL;
