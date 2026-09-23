/**
 * JSON<->row sync for Confusion. Same shape as sessionLogSync.ts — see that
 * file's header for the design rationale. Confusion has an explicit delete
 * affordance in ConfusionMistakeBank.tsx (handleDeleteConfusion), which
 * this still honors: a row missing from the incoming array is soft-removed
 * (Confusion.removed = true), so it disappears from the mirrored JSON —
 * the UI sees it as deleted — without risking a hard delete on a stale
 * client's array (see the schema comment on Confusion.removed).
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ConfusionJson {
  id: string;
  text: string;
  resolved: boolean;
  resolvedAt?: string | null;
  answer?: string | null;
}

export interface ConfusionRowLike {
  legacyId: string | null;
  id: string;
  text: string;
  resolved: boolean;
  resolvedAt: Date | null;
  answer: string | null;
}

export function confusionRowToJson(row: ConfusionRowLike): ConfusionJson {
  return {
    id: row.legacyId || row.id,
    text: row.text,
    resolved: row.resolved,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    answer: row.answer,
  };
}

export function confusionJsonToRowData(j: ConfusionJson) {
  return {
    text: j.text || '',
    resolved: !!j.resolved,
    resolvedAt: j.resolvedAt ? new Date(j.resolvedAt) : null,
    answer: j.answer ?? null,
    legacyId: j.id,
  };
}

export async function mirrorConfusionsToJson(db: DbClient, topicId: string): Promise<ConfusionJson[]> {
  const rows = await db.confusion.findMany({ where: { topicId, removed: false }, orderBy: { createdAt: 'desc' } });
  return rows.map(confusionRowToJson);
}

export async function syncConfusionsFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: ConfusionJson[]
): Promise<ConfusionJson[]> {
  const seen = new Set<string>();
  const unique = incoming.filter((c) => {
    if (!c || !c.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  for (const c of unique) {
    const existing = await db.confusion.findFirst({ where: { topicId, legacyId: c.id } });
    const data = confusionJsonToRowData(c);
    if (existing) {
      await db.confusion.update({ where: { id: existing.id }, data: { ...data, removed: false } });
    } else {
      await db.confusion.create({ data: { ...data, userId, topicId } });
    }
  }

  const allRows = await db.confusion.findMany({ where: { topicId, removed: false } });
  for (const row of allRows) {
    const stillPresent = row.legacyId && seen.has(row.legacyId);
    if (!stillPresent) {
      await db.confusion.update({ where: { id: row.id }, data: { removed: true } });
    }
  }

  return mirrorConfusionsToJson(db, topicId);
}
