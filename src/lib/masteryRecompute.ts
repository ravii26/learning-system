/**
 * Wires computeSkillMastery (pure, src/lib/mastery.ts) to the database:
 * finds every concept and review log under a skill's subtree, computes,
 * and writes the result back onto the Skill row.
 *
 * Each skill's mastery is computed directly from its subtree's underlying
 * Concept/ReviewLog rows — never from a child skill's already-computed
 * score — so skills can be recomputed in any order. No dependency graph
 * needed, which is also why a partial failure in recomputeAllSkills can't
 * leave a parent's number built on a child's stale one: they're
 * independent queries.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import { computeSkillMastery } from './mastery';

export type DbClient = PrismaClient | Prisma.TransactionClient;

/** This skill's id plus every descendant's id, via the materialized path column. */
export async function getSkillSubtreeIds(db: DbClient, userId: string, skillId: string): Promise<string[]> {
  const descendants = await db.skill.findMany({
    where: { userId, path: { has: skillId } },
    select: { id: true },
  });
  return [skillId, ...descendants.map((d) => d.id)];
}

export async function recomputeSkillMastery(db: DbClient, userId: string, skillId: string): Promise<void> {
  const subtreeIds = await getSkillSubtreeIds(db, userId, skillId);

  const topics = await db.topic.findMany({
    // deletedAt: null — a soft-deleted topic's old evidence must not keep
    // inflating a skill's mastery after it's gone from the user's view.
    where: { userId, skillId: { in: subtreeIds }, deletedAt: null },
    select: { id: true },
  });
  const topicIds = topics.map((t) => t.id);

  const concepts = topicIds.length > 0
    ? await db.concept.findMany({
        where: { userId, topicId: { in: topicIds }, suspended: false },
        select: { id: true, masteryLevel: true },
      })
    : [];
  const conceptIds = concepts.map((c) => c.id);

  const reviewLogs = conceptIds.length > 0
    ? await db.reviewLog.findMany({
        where: { userId, conceptId: { in: conceptIds } },
        select: { grade: true, reviewedAt: true },
      })
    : [];

  const practiceReps = topicIds.length > 0
    ? await db.practiceRep.findMany({
        where: { userId, topicId: { in: topicIds } },
        select: { score: true, occurredAt: true },
      })
    : [];
  const artifacts = topicIds.length > 0
    ? await db.artifact.findMany({
        where: { userId, topicId: { in: topicIds } },
        select: { id: true, occurredAt: true },
      })
    : [];

  const result = computeSkillMastery(concepts, reviewLogs, practiceReps, artifacts);
  const lastEvidenceAt = [
    ...reviewLogs.map((r) => r.reviewedAt),
    ...practiceReps.map((r) => r.occurredAt),
    ...artifacts.map((a) => a.occurredAt),
  ].reduce((latest: Date | null, d) => (latest === null || d > latest ? d : latest), null);

  await db.skill.update({
    where: { id: skillId },
    data: {
      masteryScore: result.score,
      masteryLevel: result.level,
      evidenceCount: result.evidenceCount,
      lastEvidenceAt,
      masteryBreakdown: result.breakdown as object,
      computedAt: new Date(),
    },
  });
}

export interface RecomputeAllResult {
  total: number;
  succeeded: number;
  failed: Array<{ skillId: string; name: string; error: string }>;
}

/**
 * Recomputes every skill for a user. Each skill is independent (see the
 * module doc comment), so one failure doesn't block the rest — but it must
 * be reported, not swallowed: a skill whose computedAt silently stays
 * stale after a failure looks fine until someone notices the number is
 * wrong. Call sites must surface `failed` to the caller.
 */
export async function recomputeAllSkills(db: PrismaClient, userId: string): Promise<RecomputeAllResult> {
  const skills = await db.skill.findMany({ where: { userId }, select: { id: true, name: true } });

  const failed: RecomputeAllResult['failed'] = [];
  let succeeded = 0;

  for (const skill of skills) {
    try {
      await recomputeSkillMastery(db, userId, skill.id);
      succeeded++;
    } catch (e) {
      failed.push({ skillId: skill.id, name: skill.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { total: skills.length, succeeded, failed };
}
