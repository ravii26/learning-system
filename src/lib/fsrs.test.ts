import { describe, it, expect } from 'vitest';
import { schedule, forgettingCurve, nextInterval, seedFromLegacy, type CardState } from './fsrs';

const newCard: CardState = { state: 'New', stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null };
const NOW = new Date('2026-01-01T00:00:00Z');

function reviewedCard(overrides: Partial<CardState> = {}): CardState {
  return {
    state: 'Review',
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    lastReview: new Date('2025-12-20T00:00:00Z'), // 12 days before NOW
    ...overrides,
  };
}

describe('forgettingCurve', () => {
  it('is 1.0 at zero elapsed days', () => {
    expect(forgettingCurve(0, 10)).toBeCloseTo(1.0, 5);
  });

  it('decreases monotonically as elapsed days grow', () => {
    const r1 = forgettingCurve(1, 10);
    const r10 = forgettingCurve(10, 10);
    const r100 = forgettingCurve(100, 10);
    expect(r1).toBeGreaterThan(r10);
    expect(r10).toBeGreaterThan(r100);
  });

  it('stays in (0, 1]', () => {
    for (const days of [0, 1, 5, 30, 365, 1000]) {
      const r = forgettingCurve(days, 10);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('higher stability retains longer at the same elapsed time', () => {
    expect(forgettingCurve(30, 100)).toBeGreaterThan(forgettingCurve(30, 10));
  });
});

describe('nextInterval', () => {
  it('grows with stability', () => {
    expect(nextInterval(50)).toBeGreaterThan(nextInterval(10));
  });

  it('respects the maximum interval cap', () => {
    expect(nextInterval(100000, 0.9, 365)).toBe(365);
  });

  it('never returns less than 1 day', () => {
    expect(nextInterval(0.01)).toBeGreaterThanOrEqual(1);
  });

  it('a higher target retention shortens the interval', () => {
    // Wanting to remember something MORE reliably means reviewing sooner.
    expect(nextInterval(50, 0.95)).toBeLessThan(nextInterval(50, 0.8));
  });
});

describe('schedule — new cards', () => {
  it('Again on a new card enters Learning, not Relearning', () => {
    const r = schedule(newCard, 'Again', NOW);
    expect(r.state).toBe('Learning');
  });

  it('any success on a new card enters Review', () => {
    for (const grade of ['Hard', 'Good', 'Easy'] as const) {
      expect(schedule(newCard, grade, NOW).state).toBe('Review');
    }
  });

  it('Easy produces a longer first interval than Again', () => {
    const again = schedule(newCard, 'Again', NOW);
    const easy = schedule(newCard, 'Easy', NOW);
    expect(easy.scheduledDays).toBeGreaterThan(again.scheduledDays);
  });

  it('grades order stability monotonically: Again <= Hard < Good < Easy', () => {
    const again = schedule(newCard, 'Again', NOW);
    const hard = schedule(newCard, 'Hard', NOW);
    const good = schedule(newCard, 'Good', NOW);
    const easy = schedule(newCard, 'Easy', NOW);
    expect(hard.stability).toBeGreaterThanOrEqual(again.stability);
    expect(good.stability).toBeGreaterThan(hard.stability);
    expect(easy.stability).toBeGreaterThan(good.stability);
  });

  it('difficulty is clamped to [1, 10] even for a new card', () => {
    for (const grade of ['Again', 'Hard', 'Good', 'Easy'] as const) {
      const r = schedule(newCard, grade, NOW);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('reps increments and lapses stays 0 on a first success', () => {
    const r = schedule(newCard, 'Good', NOW);
    expect(r.reps).toBe(1);
    expect(r.lapses).toBe(0);
  });

  it('lapses increments on a first Again', () => {
    const r = schedule(newCard, 'Again', NOW);
    expect(r.reps).toBe(1);
    expect(r.lapses).toBe(1);
  });
});

describe('schedule — reviewed cards', () => {
  it('a successful review increases stability', () => {
    const card = reviewedCard();
    const r = schedule(card, 'Good', NOW);
    expect(r.stability).toBeGreaterThan(card.stability);
  });

  it('Again reduces stability below the pre-review value', () => {
    const card = reviewedCard();
    const r = schedule(card, 'Again', NOW);
    expect(r.stability).toBeLessThan(card.stability);
  });

  it('Again on a previously-reviewed card enters Relearning, not Learning', () => {
    const r = schedule(reviewedCard(), 'Again', NOW);
    expect(r.state).toBe('Relearning');
  });

  it('a surprising success (long overdue) grows stability more than an on-time one', () => {
    // FSRS's key property: recalling something you were more likely to have
    // forgotten (lower retrievability at review time) is stronger evidence
    // of durable memory, so it earns a bigger stability jump.
    const onTime = reviewedCard({ lastReview: new Date('2025-12-30T00:00:00Z') }); // 2 days elapsed
    const overdue = reviewedCard({ lastReview: new Date('2025-10-01T00:00:00Z') }); // ~92 days elapsed

    const rOnTime = schedule(onTime, 'Good', NOW);
    const rOverdue = schedule(overdue, 'Good', NOW);

    expect(rOverdue.stability).toBeGreaterThan(rOnTime.stability);
  });

  it('scheduledDays grows across repeated Good reviews', () => {
    let card = newCard;
    let prevInterval = 0;
    let now = NOW;
    for (let i = 0; i < 5; i++) {
      const r = schedule(card, 'Good', now);
      expect(r.scheduledDays).toBeGreaterThanOrEqual(prevInterval);
      prevInterval = r.scheduledDays;
      card = { state: r.state, stability: r.stability, difficulty: r.difficulty, reps: r.reps, lapses: r.lapses, lastReview: r.lastReview };
      now = r.nextReview;
    }
  });

  it('reps always increments, lapses only increments on Again', () => {
    const card = reviewedCard({ reps: 5, lapses: 1 });
    expect(schedule(card, 'Good', NOW).reps).toBe(6);
    expect(schedule(card, 'Good', NOW).lapses).toBe(1);
    expect(schedule(card, 'Again', NOW).reps).toBe(6);
    expect(schedule(card, 'Again', NOW).lapses).toBe(2);
  });

  it('elapsedDays matches the gap since lastReview', () => {
    const r = schedule(reviewedCard(), 'Good', NOW);
    expect(r.elapsedDays).toBe(12);
  });

  it('a lapse cannot leave stability higher than before the lapse', () => {
    // nextForgetStability includes an explicit min() guard against this.
    const card = reviewedCard({ stability: 3 });
    const r = schedule(card, 'Again', NOW);
    expect(r.stability).toBeLessThanOrEqual(card.stability);
  });

  it('nextReview is exactly scheduledDays after now', () => {
    const r = schedule(reviewedCard(), 'Good', NOW);
    const diffDays = Math.round((r.nextReview.getTime() - NOW.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(r.scheduledDays);
  });
});

describe('seedFromLegacy', () => {
  it('seeds stability from the legacy interval, floored at 1', () => {
    expect(seedFromLegacy({ reviewIntervalDays: 14 }).stability).toBe(14);
    expect(seedFromLegacy({ reviewIntervalDays: 0 }).stability).toBe(1);
    expect(seedFromLegacy({}).stability).toBe(1);
  });

  it('seeds difficulty neutral at 5.0', () => {
    expect(seedFromLegacy({ reviewIntervalDays: 30, consecutiveRecalls: 4 }).difficulty).toBe(5.0);
  });

  it('always seeds lapses at 0 — genuinely unknown, not guessed', () => {
    expect(seedFromLegacy({ consecutiveRecalls: 7 }).lapses).toBe(0);
  });

  it('marks the seed with seededFromLegacy: true', () => {
    expect(seedFromLegacy({}).seededFromLegacy).toBe(true);
  });

  it('derives state New vs Review from whether it had any consecutive recalls', () => {
    expect(seedFromLegacy({ consecutiveRecalls: 0 }).state).toBe('New');
    expect(seedFromLegacy({ consecutiveRecalls: 3 }).state).toBe('Review');
  });

  it('carries lastReview from lastRecalledAt when present', () => {
    const seeded = seedFromLegacy({ lastRecalledAt: '2025-06-01T00:00:00Z' });
    expect(seeded.lastReview?.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });

  it('the seeded card can be scheduled immediately without throwing', () => {
    const seeded = seedFromLegacy({ reviewIntervalDays: 7, consecutiveRecalls: 2, lastRecalledAt: '2025-12-01T00:00:00Z' });
    expect(() => schedule(seeded, 'Good', NOW)).not.toThrow();
  });
});
