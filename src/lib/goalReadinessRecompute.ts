/**
 * Wires computeGoalReadiness (pure, src/lib/goalReadiness.ts) to the
 * database. Cheap enough — one query over a goal's directly-linked topics,
 * no subtree traversal like mastery's — to recompute on every read rather
 * than trust a cache; the cache fields on Goal exist so other consumers
 * (a future Today screen card, a goals list) don't each have to recompute
 * it themselves, and are written through here as a side effect.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import { computeGoalReadiness, type ReadinessResult } from './goalReadiness';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function recomputeGoalReadiness(db: DbClient, userId: string, goalId: string): Promise<ReadinessResult> {
  const links = await db.goalLink.findMany({
    where: { userId, goalId, topicId: { not: null } },
    select: { required: true, topic: { select: { id: true, title: true, status: true, progressPct: true } } },
  });

  const topics = links
    .filter((l) => l.topic)
    .map((l) => ({
      id: l.topic!.id,
      title: l.topic!.title,
      status: l.topic!.status,
      progressPct: l.topic!.progressPct,
      required: l.required,
    }));

  const result = computeGoalReadiness(topics);

  await db.goal.update({
    where: { id: goalId },
    data: {
      readinessMet: result.met,
      readinessTotal: result.total,
      readinessBreakdown: result.criteria as object,
      readinessAt: new Date(),
    },
  });

  return result;
}
