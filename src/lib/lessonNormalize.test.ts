import { describe, it, expect } from 'vitest';
import { normalizeLesson } from './lessonNormalize';

const base = { title: 'T', summary: 'S', explanation: 'E', keyTakeaways: ['k'] };

describe('normalizeLesson', () => {
  it('returns null when the core teaching content is missing', () => {
    expect(normalizeLesson(null)).toBeNull();
    expect(normalizeLesson({ title: 'T', summary: 'S' })).toBeNull();
    expect(normalizeLesson({ title: 'T', explanation: 'E' })).toBeNull();
  });

  it('drops quiz questions the UI cannot render, keeps valid ones', () => {
    const out = normalizeLesson({
      ...base,
      quiz: [
        { question: 'ok', options: ['a', 'b', 'c'], correctIndex: 1, explanation: 'why' },
        { question: 'bad index', options: ['a', 'b'], correctIndex: 5 },
        { question: 'no options', options: [], correctIndex: 0 },
        'junk',
      ],
    })!;
    expect(out.quiz).toEqual([{ question: 'ok', options: ['a', 'b', 'c'], correctIndex: 1, explanation: 'why' }]);
  });

  it('coerces list fields to clean string arrays', () => {
    const out = normalizeLesson({ ...base, whenToUse: 'not an array', commonMistakes: ['  x  ', 3, '', null] })!;
    expect(out.whenToUse).toEqual([]);
    expect(out.commonMistakes).toEqual(['x']);
  });

  it('keeps only complete review cards, capped at 5', () => {
    const cards = Array.from({ length: 7 }, (_, i) => ({ concept: `c${i}`, prompt: `p${i}`, answer: `a${i}` }));
    const out = normalizeLesson({ ...base, reviewCards: [{ prompt: 'no answer' }, ...cards] })!;
    expect(out.reviewCards).toHaveLength(5);
    expect((out.reviewCards as any[])[0]).toEqual({ concept: 'c0', prompt: 'p0', answer: 'a0' });
  });

  it('drops an incomplete socratic challenge instead of rendering placeholders', () => {
    expect(normalizeLesson({ ...base, socraticChallenge: { scenario: 's' } })!.socraticChallenge).toBeUndefined();
    expect(normalizeLesson({ ...base, socraticChallenge: { scenario: 's', question: 'q', idealAnswer: 'a' } })!.socraticChallenge)
      .toEqual({ scenario: 's', question: 'q', idealAnswer: 'a' });
  });

  it('normalizes resource types and fills a missing searchQuery from the title', () => {
    const out = normalizeLesson({ ...base, recommendedResources: [{ title: 'StatQuest: PCA', type: 'weird' }, { type: 'video' }] })!;
    expect(out.recommendedResources).toEqual([{ title: 'StatQuest: PCA', type: 'article', searchQuery: 'StatQuest: PCA', whyRecommended: '' }]);
  });
});
