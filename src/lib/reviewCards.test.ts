import { describe, it, expect } from 'vitest';
import { buildModuleReviewCards, buildQuizMissCards, isValidQuizQuestion, normalizePromptKey } from './reviewCards';

const q = (question: string, correctIndex = 0, explanation = 'because') => ({
  question, options: ['right', 'wrong a', 'wrong b', 'wrong c'], correctIndex, explanation,
});

describe('buildModuleReviewCards', () => {
  it('prefers the lesson\'s own reviewCards', () => {
    const cards = buildModuleReviewCards(
      { reviewCards: [{ concept: 'Two pointers', prompt: 'When do two pointers beat a hash set?', answer: 'Sorted input, O(1) space.' }], quiz: [q('ignored')] },
      'Two Pointers'
    );
    expect(cards).toEqual([{ title: 'Two pointers', prompt: 'When do two pointers beat a hash set?', answer: 'Sorted input, O(1) space.', sourceKind: 'lesson_card' }]);
  });

  it('falls back to quiz questions asked as open recall, answer includes the explanation', () => {
    const cards = buildModuleReviewCards({ quiz: [q('What does FSRS schedule?', 0, 'It schedules reviews.')] }, 'M');
    expect(cards[0]).toMatchObject({ prompt: 'What does FSRS schedule?', answer: 'right — It schedules reviews.', sourceKind: 'quiz' });
  });

  it('falls back to takeaways as elaborative "why is this true" prompts', () => {
    const cards = buildModuleReviewCards({ keyTakeaways: ['Hash maps give O(1) average lookup'] }, 'Hashing');
    expect(cards[0].sourceKind).toBe('takeaway');
    expect(cards[0].prompt).toContain('Hashing');
    expect(cards[0].prompt).toContain('Hash maps give O(1) average lookup');
    expect(cards[0].answer).toBe('Hash maps give O(1) average lookup');
  });

  it('skips malformed quiz questions and caps at 5 cards', () => {
    const quiz = [{ question: 'bad', options: ['only one'], correctIndex: 0 }, ...Array.from({ length: 8 }, (_, i) => q(`Question ${i}`))];
    const cards = buildModuleReviewCards({ quiz }, 'M');
    expect(cards).toHaveLength(5);
    expect(cards.every((c) => c.prompt.startsWith('Question'))).toBe(true);
  });

  it('de-duplicates prompts that differ only in punctuation/case', () => {
    const cards = buildModuleReviewCards({ reviewCards: [{ prompt: 'What is X?', answer: 'a' }, { prompt: 'what is x', answer: 'b' }] }, 'M');
    expect(cards).toHaveLength(1);
  });

  it('returns nothing for an empty or junk lesson', () => {
    expect(buildModuleReviewCards(null, 'M')).toEqual([]);
    expect(buildModuleReviewCards({ reviewCards: [{ prompt: '', answer: '' }] }, 'M')).toEqual([]);
  });
});

describe('buildQuizMissCards', () => {
  const quiz = [q('Q1', 0), q('Q2', 1), q('Q3', 2)];

  it('creates cards only for wrong answers', () => {
    const cards = buildQuizMissCards(quiz, { 0: 0, 1: 3, 2: 0 });
    expect(cards.map((c) => c.prompt)).toEqual(['Q2', 'Q3']);
    expect(cards.every((c) => c.sourceKind === 'quiz_miss')).toBe(true);
  });

  it('ignores unanswered questions', () => {
    expect(buildQuizMissCards(quiz, {})).toEqual([]);
  });
});

describe('isValidQuizQuestion', () => {
  it('rejects an out-of-range correctIndex', () => {
    expect(isValidQuizQuestion({ question: 'x', options: ['a', 'b'], correctIndex: 2 })).toBe(false);
    expect(isValidQuizQuestion({ question: 'x', options: ['a', 'b'], correctIndex: 1 })).toBe(true);
  });
});

describe('normalizePromptKey', () => {
  it('ignores case and punctuation', () => {
    expect(normalizePromptKey('What is X?!')).toBe(normalizePromptKey('what is x'));
  });
});
