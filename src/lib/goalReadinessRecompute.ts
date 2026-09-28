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
import { loadTopicKnowledge } from './topicKnowledge';
import { requiredEvidence, type CompetencyMap, type TargetLevel } from '@/data/competencies';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function recomputeGoalReadiness(db: DbClient, userId: string, goalId: string): Promise<ReadinessResult> {
  const links = await db.goalLink.findMany({
    where: { userId, goalId, topicId: { not: null } },
    select: { required: true, topic: { select: { id: true, title: true, status: true, progressPct: true, depthTarget: true } } },
  });

  const ids = links.filter((l) => l.topic).map((l) => l.topic!.id);
  const [knowledge, cold, reps, items] = await Promise.all([
    loadTopicKnowledge(userId, ids),
    db.problemAttempt.groupBy({ by: ['topicId'], where: { userId, topicId: { in: ids }, outcome: 'cold' }, _count: { _all: true } }),
    db.practiceRep.groupBy({ by: ['topicId'], where: { userId, topicId: { in: ids } }, _count: { _all: true } }),
    // Plan topics: the plan says what each topic teaches, so the proof can fit it.
    db.programItem.findMany({
      where: { userId, topicId: { in: ids }, program: { goalId, status: 'active' } },
      select: { topicId: true, shape: true, competencyKeys: true, program: { select: { competencyMap: true, intake: true } } },
    }),
  ]);
  const coldBy = new Map(cold.map((c) => [c.topicId, c._count._all]));
  const repsBy = new Map(reps.map((r) => [r.topicId, r._count._all]));
  const planOf = new Map(items.map((i) => {
    const map = i.program.competencyMap as unknown as CompetencyMap;
    const target = ((i.program.intake as { target?: TargetLevel } | null)?.target ?? 'use') as TargetLevel;
    const kinds = i.competencyKeys.map((k) => map.competencies?.find((c) => c.key === k)?.kind).filter(Boolean);
    const skill = requiredEvidence('skill', target)[0];
    return [i.topicId!, {
      needsProblems: kinds.includes('algorithm'),
      practiceNeeded: i.shape === 'practice' && skill.kind === 'practice' ? skill.minReps : null,
    }];
  }));

  const topics = links
    .filter((l) => l.topic)
    .map((l) => ({
      id: l.topic!.id,
      title: l.topic!.title,
      status: l.topic!.status,
      progressPct: l.topic!.progressPct,
      required: l.required,
      depthTarget: l.topic!.depthTarget,
      ...(planOf.has(l.topic!.id) ? {
        needsProblems: planOf.get(l.topic!.id)!.needsProblems,
        practice: planOf.get(l.topic!.id)!.practiceNeeded
          ? { done: repsBy.get(l.topic!.id) ?? 0, needed: planOf.get(l.topic!.id)!.practiceNeeded! }
          : null,
      } : {}),
      evidence: knowledge.get(l.topic!.id)
        ? { unit: knowledge.get(l.topic!.id)!.unit, counts: knowledge.get(l.topic!.id)!.counts, problemsCold: coldBy.get(l.topic!.id) ?? 0 }
        : null,
    }));

  const result = computeGoalReadiness(topics);

  await db.goal.updateMany({
    where: { id: goalId, userId },
    data: {
      readinessMet: result.met,
      readinessTotal: result.total,
      readinessBreakdown: result.criteria as object,
      readinessAt: new Date(),
    },
  });

  return result;
}
