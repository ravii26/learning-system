/**
 * JSON<->row sync for Mistake. Same shape as confusionSync.ts, plus a
 * best-effort exact-title match against the topic's Concept rows (never
 * fuzzy — see the migration plan). Two write paths land here:
 *   - the full-array PUT from ConfusionMistakeBank.tsx (syncMistakesFromJson)
 *   - api/review/spaced's fail-a-review flow, which already knows the exact
 *     Concept (createMistakeRow, called directly with a conceptId)
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface MistakeJson {
  id: string;
  concept: string;
  mistake: string;
  whyMade?: string | null;
  correctUnderstanding?: string | null;
  example?: string | null;
  howToAvoid?: string | null;
  createdAt: string;
}

export interface MistakeRowLike {
  legacyId: string | null;
  id: string;
  conceptLabel: string;
  mistake: string;
  whyMade: string | null;
  correctUnderstanding: string | null;
  example: string | null;
  howToAvoid: string | null;
  occurredAt: Date;
}

export function mistakeRowToJson(row: MistakeRowLike): MistakeJson {
  return {
    id: row.legacyId || row.id,
    concept: row.conceptLabel,
    mistake: row.mistake,
    whyMade: row.whyMade,
    correctUnderstanding: row.correctUnderstanding,
    example: row.example,
    howToAvoid: row.howToAvoid,
    createdAt: row.occurredAt.toISOString(),
  };
}

export function mistakeJsonToRowData(j: MistakeJson) {
  return {
    conceptLabel: j.concept || 'General',
    mistake: j.mistake || '',
    whyMade: j.whyMade ?? null,
    correctUnderstanding: j.correctUnderstanding ?? null,
    example: j.example ?? null,
    howToAvoid: j.howToAvoid ?? null,
    occurredAt: j.createdAt ? new Date(j.createdAt) : new Date(),
    legacyId: j.id,
  };
}

export async function mirrorMistakesToJson(db: DbClient, topicId: string): Promise<MistakeJson[]> {
  const rows = await db.mistake.findMany({ where: { topicId, removed: false }, orderBy: { occurredAt: 'desc' } });
  return rows.map(mistakeRowToJson);
}

export async function syncMistakesFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: MistakeJson[]
): Promise<MistakeJson[]> {
  const seen = new Set<string>();
  const unique = incoming.filter((m) => {
    if (!m || !m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Exact-title match only, and only when unambiguous.
  const topicConcepts = unique.length > 0 ? await db.concept.findMany({ where: { topicId }, select: { id: true, title: true } }) : [];
  const conceptByTitle = new Map<string, string[]>();
  for (const c of topicConcepts) {
    const arr = conceptByTitle.get(c.title) || [];
    arr.push(c.id);
    conceptByTitle.set(c.title, arr);
  }

  for (const m of unique) {
    const existing = await db.mistake.findFirst({ where: { topicId, legacyId: m.id } });
    const data = mistakeJsonToRowData(m);
    const matches = conceptByTitle.get(m.concept || '') || [];
    const conceptId = matches.length === 1 ? matches[0] : null;

    if (existing) {
      await db.mistake.update({ where: { id: existing.id }, data: { ...data, conceptId, removed: false } });
    } else {
      await db.mistake.create({ data: { ...data, conceptId, userId, topicId } });
    }
  }

  const allRows = await db.mistake.findMany({ where: { topicId, removed: false } });
  for (const row of allRows) {
    const stillPresent = row.legacyId && seen.has(row.legacyId);
    if (!stillPresent) {
      await db.mistake.update({ where: { id: row.id }, data: { removed: true } });
    }
  }

  return mirrorMistakesToJson(db, topicId);
}

/**
 * Creates a Mistake row directly attached to a known Concept — used by
 * api/review/spaced's fail-a-review flow, which already has the exact
 * concept and doesn't need the title-matching heuristic above.
 */
export async function createMistakeRow(
  db: DbClient,
  userId: string,
  topicId: string,
  conceptId: string,
  conceptTitle: string,
  fields: { mistake: string; whyMade?: string; howToAvoid?: string }
) {
  return db.mistake.create({
    data: {
      userId,
      topicId,
      conceptId,
      conceptLabel: conceptTitle,
      mistake: fields.mistake,
      whyMade: fields.whyMade || null,
      correctUnderstanding: 'Verify concept rules and constraints.',
      example: null,
      howToAvoid: fields.howToAvoid || null,
      occurredAt: new Date(),
      legacyId: null,
    },
  });
}
