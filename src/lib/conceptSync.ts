/**
 * Bidirectional sync between Concept rows (source of truth as of Phase 3)
 * and Topic.knowledgeMap.concepts[] (JSON mirror, kept for the pre-migration
 * UI — KnowledgeMap.tsx, KnowledgeGraph.tsx — which reads/writes it
 * directly and is not being touched in this phase).
 *
 * Two directions, two different owners:
 *
 *   - Structural edits (add/delete a concept, via KnowledgeMap.tsx's
 *     "Add Concept" / trash icon, or the AI-generate-map flow) always PUT
 *     the client's ENTIRE concepts array to /api/topics/[id]. That's
 *     syncConceptsFromJson: it reconciles rows against the incoming array
 *     and returns the rebuilt canonical JSON to persist.
 *
 *   - Scheduling changes (a spaced-review grade) go through Concept rows
 *     directly (api/review/spaced/route.ts). mirrorConceptsToJson rebuilds
 *     the JSON mirror from rows afterward so KnowledgeMap.tsx still shows
 *     the current mastery level without any changes to that component.
 *
 * Deliberately conservative: syncConceptsFromJson never writes
 * masteryLevel or any FSRS field on an EXISTING row — those are row-owned
 * after cutover, and the incoming JSON may be stale (e.g. a second tab).
 * A concept missing from the incoming array is soft-removed (suspended =
 * true), never hard-deleted, so its review history survives a UI delete.
 *
 * KNOWN GAP (found during Phase 5, not fixed there — see the project
 * memory / commit history for the reasoning): topics/[id]/page.tsx's
 * handleConfirmReactivation flow tries to reset "forgotten" concepts by
 * sending status: 'Exposed' + a reset interval through this same
 * knowledgeMap PUT path. Because this function never touches masteryLevel
 * on an existing row, that reset is silently ignored — the concept keeps
 * its real FSRS state, and the next mirror rebuild overwrites the client's
 * optimistic local update. A real fix needs a narrow, deliberate exception
 * (e.g. treat an incoming ladder DOWNGRADE as intentional and reset FSRS
 * state to match) rather than a blanket "trust the client" loosening — that
 * was judged too risky to add inline while building the rest of this
 * phase, since it's logic every structural edit runs through, not just
 * reactivation.
 */
import type { PrismaClient, Prisma, MasteryLevel } from '@prisma/client';
import { labelToEnum, enumToLabel } from './masteryLevel';
import { seedFromLegacy } from './fsrs';

/** Accepts either the top-level client or a $transaction callback's tx — both expose the same .concept.* surface these functions use. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface LegacyConceptJson {
  id: string;
  title: string;
  parentId?: string | null;
  status?: string;
  difficulty?: string;
  importance?: string;
  nextReviewDate?: string | null;
  reviewIntervalDays?: number;
  consecutiveRecalls?: number;
  lastRecalledAt?: string | null;
}

export interface ConceptRowLike {
  id: string;
  legacyId: string | null;
  title: string;
  parentId: string | null;
  masteryLevel: string;
  difficultyTag: string | null;
  importance: string | null;
}

/** Pure: one Concept row -> its JSON mirror shape. legacyId falls back to the row's own id so a freshly-created row is still addressable. */
export function conceptRowToJson(row: ConceptRowLike, legacyIdByRowId: Map<string, string>): LegacyConceptJson {
  return {
    id: row.legacyId || row.id,
    title: row.title,
    parentId: row.parentId ? legacyIdByRowId.get(row.parentId) ?? null : null,
    status: enumToLabel(row.masteryLevel),
    difficulty: row.difficultyTag || 'Medium',
    importance: row.importance || 'Medium',
  };
}

/** Pure: the create/update payload for a legacy concept, minus id/relations, which the caller attaches. */
export function legacyConceptToRowData(legacy: LegacyConceptJson) {
  const seeded = seedFromLegacy({
    reviewIntervalDays: legacy.reviewIntervalDays,
    consecutiveRecalls: legacy.consecutiveRecalls,
    lastRecalledAt: legacy.lastRecalledAt,
    status: legacy.status,
  });
  return {
    title: legacy.title?.trim() || 'Untitled concept',
    masteryLevel: labelToEnum(legacy.status) as MasteryLevel,
    difficultyTag: legacy.difficulty ?? null,
    importance: legacy.importance ?? null,
    legacyId: legacy.id,
  };
}

/**
 * Rebuilds the knowledgeMap.concepts JSON array from this topic's
 * non-suspended Concept rows. Call after any row-owned write (spaced
 * review, future concept-structure APIs) so GET /api/topics/[id] keeps
 * returning a JSON shape the old UI understands.
 */
export async function mirrorConceptsToJson(db: DbClient, topicId: string): Promise<{ concepts: LegacyConceptJson[] }> {
  const rows = await db.concept.findMany({
    where: { topicId, suspended: false },
    orderBy: { createdAt: 'asc' },
  });

  const legacyIdByRowId = new Map<string, string>();
  for (const r of rows) legacyIdByRowId.set(r.id, r.legacyId || r.id);

  return { concepts: rows.map((r) => conceptRowToJson(r, legacyIdByRowId)) };
}

export interface SyncResult {
  json: { concepts: LegacyConceptJson[] };
  created: number;
  updated: number;
  suspended: number;
}

/**
 * Reconciles Concept rows against a client-supplied concepts array (a
 * structural edit via KnowledgeMap.tsx), then returns the rebuilt JSON to
 * persist onto Topic.knowledgeMap. Must run inside a transaction the
 * caller controls, since it performs several dependent writes.
 */
export async function syncConceptsFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: LegacyConceptJson[]
): Promise<SyncResult> {
  let created = 0;
  let updated = 0;

  // De-dupe incoming legacyIds defensively — a client bug producing two
  // concepts with the same id must not silently merge them.
  const seen = new Set<string>();
  const unique = incoming.filter((c) => {
    if (!c || !c.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  const legacyToRowId = new Map<string, string>();

  // Pass 1: upsert each concept's own fields (not parentId yet).
  for (const c of unique) {
    const existing = await db.concept.findFirst({ where: { topicId, legacyId: c.id } });
    const data = legacyConceptToRowData(c);

    if (existing) {
      // Structural fields only — masteryLevel/FSRS state are row-owned and
      // untouched here, even though `data` was computed with a seed; we
      // deliberately drop the scheduling-relevant parts of `data` for an
      // existing row.
      const row = await db.concept.update({
        where: { id: existing.id },
        data: {
          title: data.title,
          difficultyTag: data.difficultyTag,
          importance: data.importance,
          suspended: false, // a concept reappearing in the array un-suspends it
        },
      });
      legacyToRowId.set(c.id, row.id);
      updated++;
    } else {
      const row = await db.concept.create({
        data: { ...data, userId, topicId },
      });
      legacyToRowId.set(c.id, row.id);
      created++;
    }
  }

  // Pass 2: resolve parentId now that every incoming legacyId has a row.
  for (const c of unique) {
    if (!c.parentId) continue;
    const parentRowId = legacyToRowId.get(c.parentId);
    const rowId = legacyToRowId.get(c.id);
    if (!rowId) continue;
    await db.concept.update({ where: { id: rowId }, data: { parentId: parentRowId ?? null } });
  }

  // Soft-remove rows whose legacyId is no longer in the incoming array —
  // the user deleted them in KnowledgeMap.tsx. Suspended, not deleted, so
  // ReviewLog history survives.
  const allRows = await db.concept.findMany({ where: { topicId, suspended: false } });
  let suspended = 0;
  for (const row of allRows) {
    const stillPresent = row.legacyId && seen.has(row.legacyId);
    if (!stillPresent) {
      await db.concept.update({ where: { id: row.id }, data: { suspended: true } });
      suspended++;
    }
  }

  const json = await mirrorConceptsToJson(db, topicId);
  return { json, created, updated, suspended };
}
