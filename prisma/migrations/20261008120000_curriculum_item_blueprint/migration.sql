-- Which sections a decision lesson should have (src/lib/lessonBlocks.ts), e.g.
-- ["comparison_table","cost_chart"]. NULL = the default set. Additive, nullable.
ALTER TABLE "CurriculumItem" ADD COLUMN "blueprint" JSONB;
