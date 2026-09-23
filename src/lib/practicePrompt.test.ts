import { describe, it, expect } from 'vitest';
import { pickPracticePrompt } from './practicePrompt';

const NOW = new Date('2026-09-23T12:00:00Z');

describe('pickPracticePrompt', () => {
  it('returns null with no candidate concepts', () => {
    expect(pickPracticePrompt([], NOW)).toBeNull();
  });

  it('picks the concept with the earliest (most overdue) nextReview', () => {
    const concepts = [
      { id: 'a', title: 'Sliding Window', nextReview: '2026-09-25T00:00:00Z' },
      { id: 'b', title: 'CAP Theorem', nextReview: '2026-09-20T00:00:00Z' },
      { id: 'c', title: 'Two Pointers', nextReview: '2026-09-30T00:00:00Z' },
    ];
    const pick = pickPracticePrompt(concepts, NOW);
    expect(pick?.conceptId).toBe('b');
    expect(pick?.conceptTitle).toBe('CAP Theorem');
  });

  it('treats a null nextReview as least urgent, sorting it last', () => {
    const concepts = [
      { id: 'a', title: 'Never reviewed', nextReview: null },
      { id: 'b', title: 'Due soon', nextReview: '2026-09-24T00:00:00Z' },
    ];
    expect(pickPracticePrompt(concepts, NOW)?.conceptId).toBe('b');
  });

  it('embeds the chosen concept title in the prompt text', () => {
    const concepts = [{ id: 'a', title: 'Economic Moats', nextReview: '2026-09-20T00:00:00Z' }];
    const pick = pickPracticePrompt(concepts, NOW);
    expect(pick?.promptText).toContain('Economic Moats');
  });

  it('is deterministic for the same day and inputs', () => {
    const concepts = [{ id: 'a', title: 'X', nextReview: null }];
    const first = pickPracticePrompt(concepts, NOW);
    const second = pickPracticePrompt(concepts, NOW);
    expect(first).toEqual(second);
  });

  it('varies the template across different days', () => {
    const concepts = [{ id: 'a', title: 'X', nextReview: null }];
    const day1 = pickPracticePrompt(concepts, new Date('2026-09-23T12:00:00Z'))!.promptText;
    const day2 = pickPracticePrompt(concepts, new Date('2026-09-24T12:00:00Z'))!.promptText;
    expect(day1).not.toBe(day2);
  });
});
