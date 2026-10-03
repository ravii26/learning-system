-- A goal's type (Tech, Business, ...): the default for every topic under it.
ALTER TABLE "Goal" ADD COLUMN "area" TEXT;
-- { topicId: statusBefore } saved when a goal leaves "active", so returning
-- to "active" puts each topic back where it was.
ALTER TABLE "Goal" ADD COLUMN "topicStatusBefore" JSONB;
