/**
 * FSRS (Free Spaced Repetition Scheduler), v4.5 formulas with the published
 * default parameter weights. Replaces the naive interval-doubling scheduler
 * that lived in api/review/spaced/route.ts (1 -> 2 -> x2, capped at 365,
 * with no notion of difficulty or how surprising a successful recall was).
 *
 * Reference: the open-spaced-repetition FSRS-4.5 algorithm (the same
 * formulas used by Anki's FSRS scheduler and the ts-fsrs library). This is
 * a from-scratch implementation of the published formulas, not a port of
 * any specific library's code.
 *
 * Deliberately NOT implemented: same-day re-review handling (short-term
 * stability), and parameter optimization from review history (needs
 * ~1000 reviews to fit; see the project plan's non-goals). Every user of
 * this app effectively gets the same, well-validated default weights.
 */

export type Grade = 'Again' | 'Hard' | 'Good' | 'Easy';
export type FsrsState = 'New' | 'Learning' | 'Review' | 'Relearning';

const GRADE_NUM: Record<Grade, 1 | 2 | 3 | 4> = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

// FSRS-4.5 default weights (w[0..18]), as published by the
// open-spaced-repetition project.
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
  0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2345679...

export const DEFAULT_REQUEST_RETENTION = 0.9;
export const DEFAULT_MAXIMUM_INTERVAL = 365;

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** Retrievability: probability of recall after `elapsedDays` at stability `S`. */
export function forgettingCurve(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function initStability(grade: Grade): number {
  return Math.max(0.1, W[GRADE_NUM[grade] - 1]);
}

function initDifficulty(grade: Grade): number {
  const g = GRADE_NUM[grade];
  return clamp(W[4] - (g - 3) * W[5], 1, 10);
}

function nextDifficulty(difficulty: number, grade: Grade): number {
  const g = GRADE_NUM[grade];
  const deltaD = -W[6] * (g - 3);
  const damped = difficulty + (deltaD * (10 - difficulty)) / 9;
  const initEasy = initDifficulty('Good'); // w[4], the mean-reversion target
  const reverted = W[7] * initEasy + (1 - W[7]) * damped;
  return clamp(reverted, 1, 10);
}

function nextRecallStability(difficulty: number, stability: number, retrievability: number, grade: Grade): number {
  const hardPenalty = grade === 'Hard' ? W[15] : 1;
  const easyBonus = grade === 'Easy' ? W[16] : 1;
  const growth =
    1 +
    Math.exp(W[8]) *
      (11 - difficulty) *
      Math.pow(stability, -W[9]) *
      (Math.exp((1 - retrievability) * W[10]) - 1) *
      hardPenalty *
      easyBonus;
  return stability * growth;
}

function nextForgetStability(difficulty: number, stability: number, retrievability: number): number {
  const s =
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp((1 - retrievability) * W[14]);
  // A lapse cannot leave the card more stable than it was before failing.
  return Math.min(s, stability);
}

/** Days until retrievability drops to `requestRetention`, given stability `S`. */
export function nextInterval(
  stability: number,
  requestRetention: number = DEFAULT_REQUEST_RETENTION,
  maximumInterval: number = DEFAULT_MAXIMUM_INTERVAL
): number {
  const interval = (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return clamp(Math.round(interval), 1, maximumInterval);
}

export interface CardState {
  state: FsrsState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: Date | null;
}

export interface ScheduleResult {
  state: FsrsState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: Date;
  nextReview: Date;
  /** Retrievability at the moment of this review — 1 for a first-ever review. */
  retrievability: number;
}

/**
 * Schedules the next review for a card given the grade just recorded.
 * Pure function: takes "now" as a parameter so it's deterministic in tests.
 */
export function schedule(
  card: CardState,
  grade: Grade,
  now: Date = new Date(),
  options: { requestRetention?: number; maximumInterval?: number } = {}
): ScheduleResult {
  const requestRetention = options.requestRetention ?? DEFAULT_REQUEST_RETENTION;
  const maximumInterval = options.maximumInterval ?? DEFAULT_MAXIMUM_INTERVAL;

  const isNew = card.state === 'New' || !card.lastReview;
  const elapsedDays = card.lastReview
    ? Math.max(0, Math.round((now.getTime() - card.lastReview.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  let difficulty: number;
  let stability: number;
  let retrievability: number;

  if (isNew) {
    difficulty = initDifficulty(grade);
    stability = initStability(grade);
    retrievability = 1;
  } else {
    retrievability = forgettingCurve(elapsedDays, card.stability);
    difficulty = nextDifficulty(card.difficulty, grade);
    stability =
      grade === 'Again'
        ? nextForgetStability(difficulty, card.stability, retrievability)
        : nextRecallStability(difficulty, card.stability, retrievability, grade);
  }

  const scheduledDays = nextInterval(stability, requestRetention, maximumInterval);
  const nextReview = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);

  const wasReview = card.state === 'Review' || card.state === 'Relearning';
  const state: FsrsState = grade === 'Again' ? (wasReview ? 'Relearning' : 'Learning') : 'Review';

  return {
    state,
    stability,
    difficulty,
    reps: card.reps + 1,
    lapses: card.lapses + (grade === 'Again' ? 1 : 0),
    elapsedDays,
    scheduledDays,
    lastReview: now,
    nextReview,
    retrievability,
  };
}

/**
 * Seeds FSRS state for a concept migrated from the legacy interval-doubling
 * scheduler, which recorded reviewIntervalDays and consecutiveRecalls but
 * no grade history and no lapse count.
 *
 * Decision (see the project plan's Phase 3 risk notes): stability is seeded
 * from the last known interval rather than reset to zero, so a year of
 * spacing isn't thrown away and the user isn't buried in due cards on day
 * one. difficulty is seeded neutral (5.0, the midpoint) since there's no
 * signal to derive it from. lapses is seeded 0 — genuinely unknown, and
 * assuming failures would be worse than assuming none. The seededFromLegacy
 * flag lets retention analytics exclude these until they've had real reviews
 * to correct the guess.
 */
export function seedFromLegacy(legacy: {
  reviewIntervalDays?: number | null;
  consecutiveRecalls?: number | null;
  lastRecalledAt?: string | null;
  status?: string | null;
}): CardState & { seededFromLegacy: true } {
  const reps = legacy.consecutiveRecalls ?? 0;
  const stability = Math.max(1, legacy.reviewIntervalDays ?? 1);
  return {
    state: reps > 0 ? 'Review' : 'New',
    stability,
    difficulty: 5.0,
    reps,
    lapses: 0,
    lastReview: legacy.lastRecalledAt ? new Date(legacy.lastRecalledAt) : null,
    seededFromLegacy: true,
  };
}
