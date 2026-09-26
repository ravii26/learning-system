import { describe, it, expect } from 'vitest';
import { parseProblemInput, summarizeProblems, problemReviewCard } from './problems';

const NOW = new Date('2026-09-26T12:00:00Z');

describe('parseProblemInput', () => {
  it('accepts a minimal problem', () => {
    const r = parseProblemInput({ title: ' Two Sum ', outcome: 'cold' }, NOW);
    expect(r.ok && r.value).toMatchObject({ title: 'Two Sum', outcome: 'cold', url: null, minutes: null, difficulty: null });
  });

  it('requires a title and a known outcome', () => {
    expect(parseProblemInput({ outcome: 'cold' }, NOW).ok).toBe(false);
    expect(parseProblemInput({ title: 'x', outcome: 'solved' }, NOW).ok).toBe(false);
  });

  it('adds https to a bare link and rejects junk', () => {
    const r = parseProblemInput({ title: 'x', outcome: 'hint', url: 'leetcode.com/problems/two-sum' }, NOW);
    expect(r.ok && r.value.url).toBe('https://leetcode.com/problems/two-sum');
    expect(parseProblemInput({ title: 'x', outcome: 'hint', url: 'not a url at all' }, NOW).ok).toBe(false);
  });

  it('bounds minutes and ignores an unknown difficulty', () => {
    expect(parseProblemInput({ title: 'x', outcome: 'cold', minutes: 0 }, NOW).ok).toBe(false);
    const r = parseProblemInput({ title: 'x', outcome: 'cold', minutes: '25', difficulty: 'insane' }, NOW);
    expect(r.ok && [r.value.minutes, r.value.difficulty]).toEqual([25, null]);
  });

  it('rejects a date in the future', () => {
    expect(parseProblemInput({ title: 'x', outcome: 'cold', attemptedAt: '2027-01-01' }, NOW).ok).toBe(false);
  });
});

describe('summarizeProblems', () => {
  it('counts outcomes overall and per module', () => {
    const s = summarizeProblems([
      { outcome: 'cold', moduleId: 'm1' },
      { outcome: 'cold', moduleId: 'm1' },
      { outcome: 'hint', moduleId: 'm2' },
      { outcome: 'stuck', moduleId: null },
      { outcome: 'bogus', moduleId: 'm1' },
    ]);
    expect(s.overall).toEqual({ cold: 2, hint: 1, stuck: 1, total: 4 });
    expect(s.byModule.m1).toEqual({ cold: 2, hint: 0, stuck: 0, total: 2 });
    expect(s.byModule.m2.hint).toBe(1);
  });
});

describe('problemReviewCard', () => {
  it('makes a card only when you needed help and wrote the key idea', () => {
    expect(problemReviewCard({ title: 'Two Sum', outcome: 'cold', notes: 'hash map' })).toBeNull();
    expect(problemReviewCard({ title: 'Two Sum', outcome: 'stuck', notes: null })).toBeNull();
    const card = problemReviewCard({ title: 'Two Sum', outcome: 'hint', notes: 'Store complements in a hash map' });
    expect(card).toMatchObject({ sourceKind: 'problem', answer: 'Store complements in a hash map' });
    expect(card!.prompt).toContain('Two Sum');
  });
});
