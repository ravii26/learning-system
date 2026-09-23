-- Phase 1 (step 1 of 2): add User, seed the single existing user, and
-- backfill userId onto every existing row — all in this migration so the
-- database is never left in a partially-scoped state between deploys.
--
-- userId stays NULLABLE here. Step 2 (a separate migration) flips it to
-- NOT NULL once this one has backfilled every row. A single migration doing
-- both would fail outright: ALTER COLUMN ... SET NOT NULL with no default
-- rejects a non-empty table.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Seed the single user this app has had since its first commit. Fixed id
-- (not gen_random_uuid()) so every environment that runs this migration
-- backfills onto the same row, and so src/lib/currentUser.ts can name it.
INSERT INTO "User" ("id", "email", "createdAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'zalaravindrasinh026@gmail.com', CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "userId" TEXT;
-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "userId" TEXT;
-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN     "userId" TEXT;

-- Backfill: every row that exists today belongs to the seed user.
UPDATE "Topic" SET "userId" = '00000000-0000-0000-0000-000000000001' WHERE "userId" IS NULL;
UPDATE "ActivityLog" SET "userId" = '00000000-0000-0000-0000-000000000001' WHERE "userId" IS NULL;
UPDATE "ReviewLog" SET "userId" = '00000000-0000-0000-0000-000000000001' WHERE "userId" IS NULL;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
