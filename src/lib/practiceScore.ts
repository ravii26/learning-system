/**
 * Rolls a rep's raw per-dimension rubric scores into the single 0..1 number
 * mastery.ts needs (see PracticeRep.score in prisma/schema.prisma). Computed
 * once at write time so nothing downstream has to know which dimensions are
 * inverted (lower-is-better, e.g. "fillers" — see Example D in the project
 * plan) — the inversion is resolved here, permanently, on the raw input.
 */

export interface RubricInput {
  scores: Record<string, number>; // raw 1..5 per dimension, as entered
  invertedKeys?: string[]; // dimensions where a LOWER raw value is better
}

const RAW_MIN = 1;
const RAW_MAX = 5;

export function computeRepScore({ scores, invertedKeys = [] }: RubricInput): number {
  const keys = Object.keys(scores);
  if (keys.length === 0) return 0;

  const normalized = keys.map((key) => {
    const clamped = Math.min(RAW_MAX, Math.max(RAW_MIN, scores[key]));
    const value = invertedKeys.includes(key) ? RAW_MAX + RAW_MIN - clamped : clamped;
    return (value - RAW_MIN) / (RAW_MAX - RAW_MIN);
  });

  return normalized.reduce((sum, v) => sum + v, 0) / normalized.length;
}
