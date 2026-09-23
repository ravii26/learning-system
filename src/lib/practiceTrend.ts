/**
 * Turns a topic's raw PracticeRep history into the curve Example D (the
 * project plan) describes: a per-dimension trend, a streak, and which
 * dimension is weakest — never a single completion percentage. This is
 * practice mode's whole answer to "how am I doing," so it operates on the
 * RAW rubric scores (1..5, pre-inversion), not the rolled-up 0..1
 * PracticeRep.score — a reader needs to see "fillers 4.0 -> 2.1", not a
 * single normalized number.
 */

export interface RepForTrend {
  occurredAt: string | Date;
  rubricScores: Record<string, number>;
  invertedKeys?: string[];
}

export interface DimensionTrend {
  key: string;
  inverted: boolean;
  values: number[]; // raw, chronological, this dimension only
  first: number; // avg of the earliest bucket
  last: number; // avg of the most recent bucket
  improving: boolean; // accounts for inversion — "lower is better" counts a falling number as improving
}

export type OverallTrend = 'New' | 'Improving' | 'Steady' | 'Needs focus';

export interface PracticeTrendResult {
  repCount: number;
  spanDays: number;
  currentStreak: number;
  dimensions: DimensionTrend[];
  overallTrend: OverallTrend;
  weakestKey: string | null;
}

const MIN_REPS_FOR_TREND = 3;
const BUCKET_SIZE = 3; // avg of the first/last N reps, not just the single endpoint — less noisy
const IMPROVEMENT_THRESHOLD = 0.15; // on the raw 1..5 scale — below this, call it "Steady"

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Consecutive calendar days with >=1 rep, counting back from the most
 * recent rep's day — but only if that day is today or yesterday. A streak
 * from 10 days ago isn't "current"; it's broken, and must report 0, not
 * whatever count it reached before lapsing.
 */
function computeStreak(sortedDates: Date[], now: Date): number {
  if (sortedDates.length === 0) return 0;
  const uniqueDays = Array.from(new Set(sortedDates.map(dateKey))).sort().reverse();
  const gapFromNow = Math.round((now.getTime() - new Date(uniqueDays[0]).getTime()) / (1000 * 60 * 60 * 24));
  if (gapFromNow > 1) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]);
    const cur = new Date(uniqueDays[i]);
    const diffDays = Math.round((prev.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function computePracticeTrend(reps: RepForTrend[], now: Date = new Date()): PracticeTrendResult {
  if (reps.length === 0) {
    return { repCount: 0, spanDays: 0, currentStreak: 0, dimensions: [], overallTrend: 'New', weakestKey: null };
  }

  const sorted = [...reps].sort((a, b) => toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime());
  const dates = sorted.map((r) => toDate(r.occurredAt));
  const spanDays = Math.max(0, Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24)));
  const currentStreak = computeStreak(dates, now);

  const allKeys = new Set<string>();
  const invertedKeys = new Set<string>();
  for (const rep of sorted) {
    for (const key of Object.keys(rep.rubricScores)) allKeys.add(key);
    for (const key of rep.invertedKeys || []) invertedKeys.add(key);
  }

  const dimensions: DimensionTrend[] = Array.from(allKeys).map((key) => {
    const values = sorted.filter((r) => r.rubricScores[key] !== undefined).map((r) => r.rubricScores[key]);
    const inverted = invertedKeys.has(key);
    // Bucket size must never exceed half the values, or a short history's
    // "first" and "last" buckets overlap entirely and every delta is 0 —
    // silently reporting "Steady" no matter how much the dimension moved.
    const bucket = Math.max(1, Math.min(BUCKET_SIZE, Math.floor(values.length / 2)));
    const first = average(values.slice(0, bucket));
    const last = average(values.slice(values.length - bucket));
    const delta = last - first;
    const improving = inverted ? delta < -IMPROVEMENT_THRESHOLD : delta > IMPROVEMENT_THRESHOLD;
    return { key, inverted, values, first, last, improving };
  });

  // Weakest = lowest normalized "last" value (inverted dimensions flipped
  // onto the same 1..5 "higher is better" scale first) — the one the plan's
  // example calls out with "<- weakest, focus here".
  let weakestKey: string | null = null;
  let weakestNormalized = Infinity;
  for (const d of dimensions) {
    const normalizedLast = d.inverted ? 6 - d.last : d.last;
    if (normalizedLast < weakestNormalized) {
      weakestNormalized = normalizedLast;
      weakestKey = d.key;
    }
  }

  let overallTrend: OverallTrend = 'New';
  if (reps.length >= MIN_REPS_FOR_TREND && dimensions.length > 0) {
    const deltas = dimensions.map((d) => (d.inverted ? d.first - d.last : d.last - d.first));
    const avgDelta = average(deltas);
    overallTrend = avgDelta > IMPROVEMENT_THRESHOLD ? 'Improving' : avgDelta < -IMPROVEMENT_THRESHOLD ? 'Needs focus' : 'Steady';
  }

  return { repCount: reps.length, spanDays, currentStreak, dimensions, overallTrend, weakestKey };
}
