-- What a lesson has to leave you able to do (src/lib/lessonKinds.ts):
-- 'concept' (every existing module) or 'decision'. Additive, defaulted.
ALTER TABLE "CurriculumItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'concept';
