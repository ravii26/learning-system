/**
 * Computes a Skill's evidence-earned mastery score. Pure function — the
 * caller queries Concept/ReviewLog/PracticeRep/Artifact rows for a skill's
 * subtree (see recomputeSkillMastery in src/lib/masteryRecompute.ts for
 * that side) and passes the results in here.
 *
 * Four evidence sources, each optional and independently weighted:
 * Concept.masteryLevel (coverage), ReviewLog (retention), PracticeRep
 * (practice — Phase 9), Artifact (artifacts — Phase 9). A source with no
 * rows contributes nothing and its weight is excluded from the
 * normalization, not scored as 0 — a skill with only concepts (no practice
 * reps at all, because it's a syllabus topic) must not be penalized for a
 * dimension that doesn't apply to it.
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

export interface MasteryPracticeRepInput {
  score: number; // 0..1, already rolled up — see src/lib/practiceScore.ts
}

export interface MasteryArtifactInput {
  // No fields needed yet — only the count matters (see ARTIFACT_TARGET
  // below). Kept as a typed array element, not a bare count, so a richer
  // per-artifact weighting (e.g. by kind) can land later without changing
  // this function's call signature.
  id?: string;
}

export interface MasteryBreakdown {
  retention: number; // 0..1 — fraction of reviews that weren't a lapse
  coverage: number; // 0..1 — fraction of concepts at Understood or above
  practice: number; // 0..1 — average rolled-up PracticeRep score
  artifacts: number; // 0..1 — saturating count, see ARTIFACT_TARGET
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

// Evidence-earned, not a hard requirement: 5 artifacts saturates the
// "artifacts" component at 1.0, matching Example A's "58 problems, 3 mock
// interviews" reading as strong-but-not-maxed evidence. A defensible,
// documented convention — not a claim that 5 is a magic number.
const ARTIFACT_TARGET = 5;

// Equal weighting across whichever evidence sources actually have data —
// see the module doc comment for why an absent source is excluded from
// normalization rather than scored as 0.
const WEIGHTS = { retention: 0.25, coverage: 0.25, practice: 0.25, artifacts: 0.25 };

export function computeSkillMastery(
  concepts: MasteryConceptInput[],
  reviewLogs: MasteryReviewLogInput[],
  practiceReps: MasteryPracticeRepInput[] = [],
  artifacts: MasteryArtifactInput[] = []
): MasteryResult {
  const coverage = concepts.length > 0 ? concepts.filter((c) => isCovered(c.masteryLevel)).length / concepts.length : 0;
  const retention = reviewLogs.length > 0 ? reviewLogs.filter((r) => !isLapse(r.grade)).length / reviewLogs.length : 0;
  const practice = practiceReps.length > 0 ? practiceReps.reduce((sum, r) => sum + r.score, 0) / practiceReps.length : 0;
  const artifactsScore = artifacts.length > 0 ? Math.min(1, artifacts.length / ARTIFACT_TARGET) : 0;

  const breakdown: MasteryBreakdown = { retention, coverage, practice, artifacts: artifactsScore };

  const weightedParts: Array<[number, number]> = [
    [coverage, concepts.length > 0 ? WEIGHTS.coverage : 0],
    [retention, reviewLogs.length > 0 ? WEIGHTS.retention : 0],
    [practice, practiceReps.length > 0 ? WEIGHTS.practice : 0],
    [artifactsScore, artifacts.length > 0 ? WEIGHTS.artifacts : 0],
  ];
  const totalWeight = weightedParts.reduce((sum, [, w]) => sum + w, 0);
  const score = totalWeight > 0
    ? weightedParts.reduce((sum, [v, w]) => sum + v * w, 0) / totalWeight
    : 0;

  const level = scoreToLevel(score);

  return {
    score: Math.min(1, Math.max(0, score)),
    level,
    breakdown,
    evidenceCount: concepts.length + reviewLogs.length + practiceReps.length + artifacts.length,
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
