import type { ReviewCardDraft } from './reviewCards';

/**
 * The problem log: practice problems you tried and how it went. Recall
 * proves you remember an idea; this proves you can use it under pressure,
 * which is what "interview-ready" means. Pure helpers; routes persist.
 */

export type ProblemOutcome = 'cold' | 'hint' | 'stuck';
export const PROBLEM_OUTCOMES: ProblemOutcome[] = ['cold', 'hint', 'stuck'];
export const PROBLEM_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

/** Solved-cold problems per module that we treat as "can do it in an interview". */
export const COLD_TARGET = 5;

export const OUTCOME_LABEL: Record<ProblemOutcome, string> = {
  cold: 'Solved cold',
  hint: 'With a hint',
  stuck: 'Got stuck',
};

export interface ProblemInput {
  title: string;
  url: string | null;
  difficulty: ProblemDifficulty | null;
  outcome: ProblemOutcome;
  minutes: number | null;
  notes: string | null;
  moduleId: string | null;
  attemptedAt: Date | null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Validates a request body. Returns the clean input or an error message. */
export function parseProblemInput(body: unknown, now: Date = new Date()): { ok: true; value: ProblemInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = text(b.title, 200);
  if (!title) return { ok: false, error: 'Give the problem a name' };
  const outcome = b.outcome as ProblemOutcome;
  if (!PROBLEM_OUTCOMES.includes(outcome)) return { ok: false, error: 'outcome must be cold, hint or stuck' };

  let url = text(b.url, 500);
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (url) {
    try {
      new URL(url);
    } catch {
      return { ok: false, error: 'That link doesn’t look like a web address' };
    }
  }

  const difficulty = PROBLEM_DIFFICULTIES.includes(b.difficulty as ProblemDifficulty) ? (b.difficulty as ProblemDifficulty) : null;

  let minutes: number | null = null;
  if (b.minutes !== undefined && b.minutes !== null && b.minutes !== '') {
    const m = Math.round(Number(b.minutes));
    if (!Number.isFinite(m) || m < 1 || m > 600) return { ok: false, error: 'minutes must be between 1 and 600' };
    minutes = m;
  }

  let attemptedAt: Date | null = null;
  if (b.attemptedAt) {
    const d = new Date(String(b.attemptedAt));
    if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime() + 60_000) return { ok: false, error: 'attemptedAt must be a valid date, not in the future' };
    attemptedAt = d;
  }

  return {
    ok: true,
    value: { title, url, difficulty, outcome, minutes, notes: text(b.notes, 2000), moduleId: text(b.moduleId, 100), attemptedAt },
  };
}

export interface OutcomeCounts {
  cold: number;
  hint: number;
  stuck: number;
  total: number;
}

const zero = (): OutcomeCounts => ({ cold: 0, hint: 0, stuck: 0, total: 0 });

export function summarizeProblems(problems: Array<{ outcome: string; moduleId: string | null }>): {
  overall: OutcomeCounts;
  byModule: Record<string, OutcomeCounts>;
} {
  const overall = zero();
  const byModule: Record<string, OutcomeCounts> = {};
  for (const p of problems) {
    if (!PROBLEM_OUTCOMES.includes(p.outcome as ProblemOutcome)) continue;
    const o = p.outcome as ProblemOutcome;
    overall[o] += 1;
    overall.total += 1;
    if (p.moduleId) {
      const m = (byModule[p.moduleId] ??= zero());
      m[o] += 1;
      m.total += 1;
    }
  }
  return { overall, byModule };
}

/**
 * A problem you needed help with comes back as a review card — but only
 * when you wrote down the key idea, since a card with no answer can't be
 * checked.
 */
export function problemReviewCard(p: { title: string; outcome: ProblemOutcome; notes: string | null }): ReviewCardDraft | null {
  if (p.outcome === 'cold' || !p.notes) return null;
  return {
    title: `Problem: ${p.title}`.slice(0, 120),
    prompt: `How do you solve “${p.title}”? What’s the key idea?`,
    answer: p.notes,
    sourceKind: 'problem',
  };
}
