import type { Prisma, PrismaClient } from '@prisma/client';
import { computePaceByKind, secondsByModule, type PaceByKind } from './pace';

type Db = PrismaClient | Prisma.TransactionClient;

const RECENT_FINISHED = 200;
const select = { topicId: true, legacyId: true, kind: true, estimatedMinutes: true, completedAt: true } as const;

/**
 * Your pace per lesson kind, and, with `topicId`, the time spent on each
 * finished lesson of that topic.
 */
export async function loadPace(db: Db, userId: string, topicId?: string): Promise<{ byKind: PaceByKind; moduleSeconds: Record<string, number> }> {
  const base = { userId, completed: true, completedAt: { not: null }, removed: false, topic: { deletedAt: null } };
  const [recent, inTopic] = await Promise.all([
    db.curriculumItem.findMany({ where: base, orderBy: { completedAt: 'desc' }, take: RECENT_FINISHED, select }),
    topicId ? db.curriculumItem.findMany({ where: { ...base, topicId }, select }) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const items = [...recent, ...inTopic].filter((i) => {
    const key = `${i.topicId}|${i.legacyId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length === 0) return { byKind: {}, moduleSeconds: {} };

  const entries = await db.studyTimeEntry.findMany({
    where: { userId, moduleId: { in: items.map((i) => i.legacyId) } },
    select: { topicId: true, moduleId: true, seconds: true, startedAt: true },
  });
  const totals = secondsByModule(items, entries);

  const byKind = computePaceByKind(items.map((i) => ({
    kind: i.kind,
    estimatedMinutes: i.estimatedMinutes,
    actualSeconds: totals.get(`${i.topicId}|${i.legacyId}`) ?? 0,
    completedAt: i.completedAt as Date,
  })));
  const moduleSeconds: Record<string, number> = {};
  for (const i of items) {
    const seconds = totals.get(`${i.topicId}|${i.legacyId}`);
    if (i.topicId === topicId && seconds) moduleSeconds[i.legacyId] = seconds;
  }
  return { byKind, moduleSeconds };
}
