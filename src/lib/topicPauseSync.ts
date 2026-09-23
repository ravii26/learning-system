/**
 * JSON<->row sync for TopicPause. Same shape as sessionLogSync.ts — see
 * that file's header for the design rationale.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface TopicPauseJson {
  id: string;
  pausedAt: string;
  resumedAt: string | null;
  reason: string | null;
  completedConcepts: string[];
  currentConcept: string | null;
  openQuestion: string | null;
  reactivationScore: string | number | null;
}

export interface TopicPauseRowLike {
  legacyId: string | null;
  id: string;
  pausedAt: Date;
  resumedAt: Date | null;
  reason: string | null;
  completedConcepts: string[];
  currentConcept: string | null;
  openQuestion: string | null;
  reactivationScore: string | null;
}

export function topicPauseRowToJson(row: TopicPauseRowLike): TopicPauseJson {
  return {
    id: row.legacyId || row.id,
    pausedAt: row.pausedAt.toISOString(),
    resumedAt: row.resumedAt ? row.resumedAt.toISOString() : null,
    reason: row.reason,
    completedConcepts: row.completedConcepts,
    currentConcept: row.currentConcept,
    openQuestion: row.openQuestion,
    reactivationScore: row.reactivationScore,
  };
}

export function topicPauseJsonToRowData(j: TopicPauseJson) {
  return {
    pausedAt: j.pausedAt ? new Date(j.pausedAt) : new Date(),
    resumedAt: j.resumedAt ? new Date(j.resumedAt) : null,
    reason: j.reason ?? null,
    completedConcepts: Array.isArray(j.completedConcepts) ? j.completedConcepts.map(String) : [],
    currentConcept: j.currentConcept ?? null,
    openQuestion: j.openQuestion ?? null,
    reactivationScore: j.reactivationScore != null ? String(j.reactivationScore) : null,
    legacyId: j.id,
  };
}

export async function mirrorTopicPausesToJson(db: DbClient, topicId: string): Promise<TopicPauseJson[]> {
  const rows = await db.topicPause.findMany({ where: { topicId, removed: false }, orderBy: { pausedAt: 'asc' } });
  return rows.map(topicPauseRowToJson);
}

export async function syncTopicPausesFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: TopicPauseJson[]
): Promise<TopicPauseJson[]> {
  const seen = new Set<string>();
  const unique = incoming.filter((p) => {
    if (!p || !p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  for (const p of unique) {
    const existing = await db.topicPause.findFirst({ where: { topicId, legacyId: p.id } });
    const data = topicPauseJsonToRowData(p);
    if (existing) {
      await db.topicPause.update({ where: { id: existing.id }, data: { ...data, removed: false } });
    } else {
      await db.topicPause.create({ data: { ...data, userId, topicId } });
    }
  }

  const allRows = await db.topicPause.findMany({ where: { topicId, removed: false } });
  for (const row of allRows) {
    const stillPresent = row.legacyId && seen.has(row.legacyId);
    if (!stillPresent) {
      await db.topicPause.update({ where: { id: row.id }, data: { removed: true } });
    }
  }

  return mirrorTopicPausesToJson(db, topicId);
}
