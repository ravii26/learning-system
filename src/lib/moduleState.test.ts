import { describe, it, expect } from 'vitest';
import { moduleKnowledge, cardKnowledge, countKnowledge, recallProbability, type CardEvidence } from './moduleState';

const NOW = new Date('2026-09-26T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

const fresh: CardEvidence = { state: 'New', reps: 0, stability: null, lastReview: null };
// Reviewed yesterday with 10-day stability: recall ≈ 0.99
const retained: CardEvidence = { state: 'Review', reps: 2, stability: 10, lastReview: daysAgo(1) };
// Reviewed 60 days ago with 5-day stability: recall well under 0.8
const slipping: CardEvidence = { state: 'Review', reps: 3, stability: 5, lastReview: daysAgo(60) };
const lapsed: CardEvidence = { state: 'Relearning', reps: 4, stability: 2, lastReview: daysAgo(1) };

const base = { completed: false, cards: [] as CardEvidence[] };

describe('moduleKnowledge', () => {
  it('is unseen with no evidence at all', () => {
    expect(moduleKnowledge(base, NOW).state).toBe('unseen');
  });

  it('ignores under a minute of tracked time', () => {
    expect(moduleKnowledge({ ...base, studySeconds: 40 }, NOW).state).toBe('unseen');
    expect(moduleKnowledge({ ...base, studySeconds: 90 }, NOW).state).toBe('learning');
  });

  it('is learning once finished but unproven', () => {
    const r = moduleKnowledge({ ...base, completed: true }, NOW);
    expect(r.state).toBe('learning');
    expect(r.reason).toMatch(/quiz/);
  });

  it('is solid when finished and the quiz passed, with no cards to review', () => {
    expect(moduleKnowledge({ ...base, completed: true, latestQuiz: { score: 0.75 } }, NOW).state).toBe('solid');
  });

  it('a correct challenge counts as passing the check', () => {
    expect(moduleKnowledge({ ...base, completed: true, latestChallenge: { verdict: 'correct' } }, NOW).state).toBe('solid');
  });

  it('a partial challenge alone is not a pass', () => {
    expect(moduleKnowledge({ ...base, completed: true, latestChallenge: { verdict: 'partial' } }, NOW).state).toBe('learning');
  });

  it('a failed latest quiz keeps it learning, even with retained cards, and says why', () => {
    const r = moduleKnowledge({ ...base, completed: true, latestQuiz: { score: 0.5 }, cards: [retained, retained] }, NOW);
    expect(r.state).toBe('learning');
    expect(r.reason).toContain('50%');
  });

  it('with cards, passing the quiz is not enough — it needs a spaced recall', () => {
    const r = moduleKnowledge({ ...base, completed: true, latestQuiz: { score: 1 }, cards: [fresh, fresh] }, NOW);
    expect(r.state).toBe('learning');
    expect(r.reason).toMatch(/first spaced review/);
  });

  it('is solid once most cards survived a spaced review', () => {
    expect(moduleKnowledge({ ...base, completed: true, latestQuiz: { score: 1 }, cards: [retained, retained, fresh] }, NOW).state).toBe('solid');
  });

  it('stays learning below the retained share, and counts progress', () => {
    const r = moduleKnowledge({ ...base, completed: true, cards: [retained, fresh, fresh] }, NOW);
    expect(r.state).toBe('learning');
    expect(r.reason).toBe('1 of 3 review cards recalled so far');
  });

  it('fades when a once-retained card is slipping', () => {
    const r = moduleKnowledge({ ...base, completed: true, latestQuiz: { score: 1 }, cards: [retained, slipping] }, NOW);
    expect(r.state).toBe('fading');
    expect(r.reason).toMatch(/^1 review card is slipping/);
  });

  it('fades when a card lapsed into relearning', () => {
    expect(moduleKnowledge({ ...base, completed: true, cards: [lapsed, retained] }, NOW).state).toBe('fading');
  });

  it('an overdue card that was never retained is not fading — it was never known', () => {
    const neverRetained: CardEvidence = { state: 'Learning', reps: 1, stability: 0.5, lastReview: daysAgo(30) };
    expect(moduleKnowledge({ ...base, completed: true, cards: [neverRetained] }, NOW).state).toBe('learning');
  });
});

describe('cardKnowledge', () => {
  it('maps a single idea card', () => {
    expect(cardKnowledge(fresh, NOW)).toBe('learning');
    expect(cardKnowledge(retained, NOW)).toBe('solid');
    expect(cardKnowledge(slipping, NOW)).toBe('fading');
    expect(cardKnowledge(lapsed, NOW)).toBe('fading');
  });
});

describe('recallProbability', () => {
  it('is null for a card never reviewed', () => {
    expect(recallProbability(fresh, NOW)).toBeNull();
  });
  it('decays with time since the last review', () => {
    const soon = recallProbability(retained, NOW)!;
    const later = recallProbability({ ...retained, lastReview: daysAgo(30) }, NOW)!;
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeGreaterThan(0.95);
  });
});

describe('countKnowledge', () => {
  it('counts each state', () => {
    expect(countKnowledge(['solid', 'solid', 'fading', 'unseen'])).toEqual({ unseen: 1, learning: 0, solid: 2, fading: 1 });
  });
});
