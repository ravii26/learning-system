-- Your own weekly study target, and how long each review card actually took.
ALTER TABLE "User" ADD COLUMN "weeklyTargetMinutes" INTEGER;
ALTER TABLE "ReviewLog" ADD COLUMN "durationMs" INTEGER;
