import { describe, expect, it } from 'vitest';
import { buildFeedbackMessages, parseFeedback, speechStats } from './practiceFeedback';
import { getRubricTemplate } from './practiceRubrics';

describe('speechStats', () => {
  it('counts words, pace and fillers', () => {
    const s = speechStats('Um so basically I worked on, like, uh a Redis cache you know and it was fast', 30);
    expect(s.words).toBe(17);
    expect(s.wordsPerMinute).toBe(34);
    expect(Object.fromEntries(s.fillers.map((f) => [f.word, f.count]))).toMatchObject({ um: 1, uh: 1, basically: 1, 'you know': 1, like: 1 });
  });
  it('does not count "like" as a verb', () => {
    expect(speechStats('I like Python and I would like this role').fillers.find((f) => f.word === 'like')).toBeUndefined();
  });
  it('no pace without enough time', () => {
    expect(speechStats('hello there', 5).wordsPerMinute).toBeNull();
    expect(speechStats('', null)).toMatchObject({ words: 0, fillerCount: 0 });
  });
});

describe('feedback prompt and parsing', () => {
  const t = getRubricTemplate('impromptu');
  it('tells the AI which dimensions are inverted and that it has text only', () => {
    const m = buildFeedbackMessages({ skill: 'Interviews', promptText: 'Tell me about yourself', answer: 'Myself Ravi', spoken: true, stats: speechStats('Myself Ravi', 20), template: t });
    const text = m[1].content;
    expect(text).toMatch(/"rambling".*INVERTED/);
    expect(text).toMatch(/never comment on accent/);
    expect(text).toMatch(/speech-to-text/);
  });
  it('clamps scores and keeps only this template\'s dimensions', () => {
    const f = parseFeedback({ scores: { clarity: 9, structure: 0, confidence: 3.4, rambling: 2, extra: 5 }, summary: 'ok', fixes: [{ said: 'Myself Ravi', better: 'I’m Ravi', why: 'x' }] }, t);
    expect(f!.scores).toEqual({ clarity: 5, structure: 1, confidence: 3, rambling: 2 });
    expect(f!.fixes).toHaveLength(1);
  });
  it('rejects a reply missing a dimension', () => {
    expect(parseFeedback({ scores: { clarity: 3 }, summary: 'ok' }, t)).toBeNull();
    expect(parseFeedback('not json', t)).toBeNull();
  });
});
