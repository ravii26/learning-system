/**
 * JSON<->row sync for SessionLog, mirroring the pattern in conceptSync.ts.
 * Topic.sessionLogs is always PUT as a whole array (topics/[id]/page.tsx's
 * handleSaveSessionLog appends locally and sends the full array back), so
 * syncSessionLogsFromJson reconciles rows against it and returns the
 * rebuilt canonical JSON. See Confusion.removed's schema comment for why
 * this soft-removes rather than hard-deletes.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface SessionLogJson {
  id: string;
  activityType: string;
  whatDone: string;
  oneInsight: string;
  whatWasHard: string;
  nextAction: string;
  durationMinutes: number;
  moduleId?: string | null;
  timestamp: string;
}

export interface SessionLogRowLike {
  legacyId: string | null;
  id: string;
  activityType: string;
  whatDone: string;
  oneInsight: string;
  whatWasHard: string;
  nextAction: string;
  durationMinutes: number;
  moduleId: string | null;
  timestamp: Date;
}

export function sessionLogRowToJson(row: SessionLogRowLike): SessionLogJson {
  return {
    id: row.legacyId || row.id,
    activityType: row.activityType,
    whatDone: row.whatDone,
    oneInsight: row.oneInsight,
    whatWasHard: row.whatWasHard,
    nextAction: row.nextAction,
    durationMinutes: row.durationMinutes,
    moduleId: row.moduleId,
    timestamp: row.timestamp.toISOString(),
  };
}

export function sessionLogJsonToRowData(j: SessionLogJson) {
  return {
    activityType: j.activityType || 'free_explore',
    whatDone: j.whatDone || '',
    oneInsight: j.oneInsight || '',
    whatWasHard: j.whatWasHard || '',
    nextAction: j.nextAction || '',
    durationMinutes: Number(j.durationMinutes) || 0,
    moduleId: j.moduleId ?? null,
    timestamp: j.timestamp ? new Date(j.timestamp) : new Date(),
    legacyId: j.id,
  };
}

export async function mirrorSessionLogsToJson(db: DbClient, topicId: string): Promise<SessionLogJson[]> {
  const rows = await db.sessionLog.findMany({ where: { topicId, removed: false }, orderBy: { timestamp: 'asc' } });
  return rows.map(sessionLogRowToJson);
}

export async function syncSessionLogsFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: SessionLogJson[]
): Promise<SessionLogJson[]> {
  const seen = new Set<string>();
  const unique = incoming.filter((s) => {
    if (!s || !s.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  for (const s of unique) {
    const existing = await db.sessionLog.findFirst({ where: { topicId, legacyId: s.id } });
    const data = sessionLogJsonToRowData(s);
    if (existing) {
      await db.sessionLog.update({ where: { id: existing.id }, data: { ...data, removed: false } });
    } else {
      await db.sessionLog.create({ data: { ...data, userId, topicId } });
    }
  }

  const allRows = await db.sessionLog.findMany({ where: { topicId, removed: false } });
  for (const row of allRows) {
    const stillPresent = row.legacyId && seen.has(row.legacyId);
    if (!stillPresent) {
      await db.sessionLog.update({ where: { id: row.id }, data: { removed: true } });
    }
  }

  return mirrorSessionLogsToJson(db, topicId);
}
