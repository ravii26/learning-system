/**
 * Computes a Skill's evidence-earned mastery score. Pure function — the
 * caller queries Concept rows + ReviewLog history for a skill's subtree
 * (see recomputeSkillMastery in src/lib/masteryRecompute.ts for that side)
 * and passes the results in here.
 *
 * Only two evidence sources exist today: Concept.masteryLevel (coverage)
 * and ReviewLog (retention). PracticeRep and Artifact don't exist until
 * Phases 8/9 — their weights are reserved (present in the breakdown,
 * always 0) so the UI and this function's shape don't have to change again
 * when those land, only the weights and the caller's queries.
 *
 * Honesty rule from the project plan (Part 3): mastery is a summary of
 * visible evidence, not an oracle. This function always returns the full
 * breakdown alongside the single score — never present the score alone.
 */
import { MASTERY_LADDER, labelToEnum, type MasteryLevelEnum } from './masteryLevel';

export interface MasteryConceptInput {
  masteryLevel: string; // enum value, e.g. 'CanRecall'
}

export interface MasteryReviewLogInput {
  grade: string; // 'Again' | 'Hard' | 'Good' | 'Easy'
}

export interface MasteryBreakdown {
  retention: number; // 0..1 — fraction of reviews that weren't a lapse
  coverage: number; // 0..1 — fraction of concepts at Understood or above
  practice: number; // reserved for Phase 9 (PracticeRep) — always 0 today
  artifacts: number; // reserved for Phase 9 (Artifact) — always 0 today
}

export interface MasteryResult {
  score: number; // 0..1
  level: MasteryLevelEnum;
  breakdown: MasteryBreakdown;
  evidenceCount: number;
}

// Coverage counts a concept as "mastered" once it clears Exposed — matches
// the existing convention in progressCalculator.ts, kept consistent rather
// than inventing a second threshold for the same idea.
function isCovered(level: string): boolean {
  return level !== 'Unknown' && level !== 'Exposed';
}

function isLapse(grade: string): boolean {
  return grade === 'Again';
}

const WEIGHTS = { retention: 0.5, coverage: 0.5, practice: 0, artifacts: 0 };

export function computeSkillMastery(
  concepts: MasteryConceptInput[],
  reviewLogs: MasteryReviewLogInput[]
): MasteryResult {
  const coverage = concepts.length > 0 ? concepts.filter((c) => isCovered(c.masteryLevel)).length / concepts.length : 0;

  const retention = reviewLogs.length > 0 ? reviewLogs.filter((r) => !isLapse(r.grade)).length / reviewLogs.length : 0;

  const breakdown: MasteryBreakdown = { retention, coverage, practice: 0, artifacts: 0 };

  const hasEvidence = concepts.length > 0 || reviewLogs.length > 0;
  const totalWeight = (concepts.length > 0 ? WEIGHTS.coverage : 0) + (reviewLogs.length > 0 ? WEIGHTS.retention : 0);
  const score = hasEvidence && totalWeight > 0
    ? (coverage * (concepts.length > 0 ? WEIGHTS.coverage : 0) + retention * (reviewLogs.length > 0 ? WEIGHTS.retention : 0)) / totalWeight
    : 0;

  const level = scoreToLevel(score);

  return {
    score: Math.min(1, Math.max(0, score)),
    level,
    breakdown,
    evidenceCount: concepts.length + reviewLogs.length,
  };
}

/**
 * Maps a 0..1 score onto the 9-rung ladder by dividing it into equal
 * buckets. A defensible, documented convention — not a claim of precision.
 * Always shown next to the breakdown (see the module doc comment), never
 * as a bare number implying more certainty than nine roughly-equal buckets
 * actually carries.
 */
export function scoreToLevel(score: number): MasteryLevelEnum {
  const clamped = Math.min(1, Math.max(0, score));
  const bucketSize = 1 / MASTERY_LADDER.length;
  const index = Math.min(MASTERY_LADDER.length - 1, Math.floor(clamped / bucketSize));
  return labelToEnum(MASTERY_LADDER[index]);
}
