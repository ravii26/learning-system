-- Adds a soft-delete flag to the four Phase 5 extraction tables. Caught
-- during design, before the sync layer was built: reconciling a topic's
-- whole JSON array on every PUT means a stale client (a second tab, or a
-- request racing a concurrent write elsewhere) could send an array that
-- doesn't yet include a just-created row, and treating "missing from the
-- array" as a hard delete would destroy that row. `removed` lets the sync
-- treat absence-from-array as a soft removal instead, matching
-- Concept.suspended's existing pattern.

-- AlterTable
ALTER TABLE "Confusion" ADD COLUMN     "removed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Mistake" ADD COLUMN     "removed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SessionLog" ADD COLUMN     "removed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TopicPause" ADD COLUMN     "removed" BOOLEAN NOT NULL DEFAULT false;
