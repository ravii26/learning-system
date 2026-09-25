import { describe, it, expect } from 'vitest';
import { buildLessonContext, mapLearnerLevel } from './lessonContext';

const modules = [
  { legacyId: 'a', order: 1, title: 'Arrays', completed: true },
  { legacyId: 'b', order: 2, title: 'Two Pointers', completed: false },
  { legacyId: 'c', order: 3, title: 'Sliding Window', completed: false },
];

describe('mapLearnerLevel', () => {
  it.each([
    ['Beginner', 'beginner'],
    ['Intermediate', 'intermediate'],
    ['Advanced', 'advanced'],
    [undefined, 'beginner'],
    ['nonsense', 'beginner'],
  ])('%s -> %s', (input, out) => expect(mapLearnerLevel(input)).toBe(out));
});

describe('buildLessonContext', () => {
  it('states the module position, earlier modules, and the next one', () => {
    const ctx = buildLessonContext({ modules, moduleId: 'b' });
    expect(ctx.coursePosition).toContain('module 2 of 3');
    expect(ctx.coursePosition).toContain('Arrays');
    expect(ctx.coursePosition).toContain('"Sliding Window"');
    expect(ctx.priorKnowledge).toContain('Arrays');
  });

  it('describes the first and final modules correctly', () => {
    expect(buildLessonContext({ modules, moduleId: 'a' }).coursePosition).toContain('first module');
    expect(buildLessonContext({ modules, moduleId: 'c' }).coursePosition).toContain('final module');
  });

  it('leaves position empty for an unknown module id rather than guessing', () => {
    expect(buildLessonContext({ modules, moduleId: 'zzz' }).coursePosition).toBe('');
  });

  it('turns partial/incorrect challenges and open confusions into weaknesses', () => {
    const ctx = buildLessonContext({
      modules,
      moduleId: 'c',
      attempts: [
        { moduleId: 'b', kind: 'challenge', verdict: 'partial', details: { missed: 'Forgot the array must be sorted' } },
        { moduleId: 'a', kind: 'challenge', verdict: 'correct', details: { missed: 'n/a' } },
      ],
      confusions: [{ text: 'Why does the window shrink?', resolved: false }, { text: 'resolved one', resolved: true }],
    });
    expect(ctx.knownWeaknesses).toEqual(['Forgot the array must be sorted', 'Why does the window shrink?']);
  });

  it('turns wrong quiz answers and logged mistakes into recent mistakes', () => {
    const ctx = buildLessonContext({
      modules,
      moduleId: 'c',
      attempts: [
        { moduleId: 'b', kind: 'quiz', verdict: null, details: [
          { question: 'When do pointers converge?', chosen: 'Always', isCorrect: false },
          { question: 'ok', chosen: 'x', isCorrect: true },
        ] },
      ],
      mistakes: [{ mistake: 'Off-by-one on the right pointer' }],
    });
    expect(ctx.recentMistakes).toEqual(['Answered "Always" to: When do pointers converge?', 'Off-by-one on the right pointer']);
  });

  it('caps each list at 5 items', () => {
    const confusions = Array.from({ length: 9 }, (_, i) => ({ text: `c${i}`, resolved: false }));
    expect(buildLessonContext({ modules, moduleId: 'a', confusions }).knownWeaknesses).toHaveLength(5);
  });
});
