import { describe, expect, it } from 'vitest';
import { sanitizeMap } from './program/mapDraft';
import { sanitizeTopics } from './roadmapTopics';

// The map checker wants a believable plan, so the lessons under test sit in a
// small but complete four-topic map.
const comp = (lessons: unknown, extra: Record<string, unknown> = {}) => ({
  key: 'db', title: 'Databases', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', summary: 'Pick and use a database.', lessons, ...extra,
});
const filler = [
  { key: 'positioning', title: 'Positioning', group: 'Foundations', kind: 'concept', importance: 'core', from: 'aware', summary: 'Say what you offer.' },
  { key: 'channels', title: 'Channels', group: 'Growth', kind: 'concept', importance: 'supporting', from: 'use', summary: 'Choose channels.' },
  { key: 'campaign', title: 'Run a first campaign project', group: 'Practice', kind: 'build', importance: 'core', from: 'use', summary: 'Ship a campaign.' },
];
const mapOf = (lessons: unknown, extra: Record<string, unknown> = {}) =>
  sanitizeMap({ title: 'T', competencies: [comp(lessons, extra), ...filler] }, 'T').map!.competencies[0];

describe('plan builder: lessons with kinds', () => {
  it('turns { title, kind } lessons into titles plus labels keyed by title', () => {
    const c = mapOf([
      { title: 'Choosing a database: SQL vs NoSQL', kind: 'decision' },
      { title: 'Requirements and estimation', kind: 'concept' },
      { title: 'Indexes', kind: 'not-a-kind' },
      'Plain string lesson',
    ]);
    expect(c.lessons).toEqual(['Choosing a database: SQL vs NoSQL', 'Requirements and estimation', 'Indexes', 'Plain string lesson']);
    expect(c.lessonKinds).toEqual({ 'Choosing a database: SQL vs NoSQL': 'decision', 'Requirements and estimation': 'concept' });
  });
  it('still accepts the old plain-title shape, with no labels', () => {
    const c = mapOf(['A', 'B']);
    expect(c.lessons).toEqual(['A', 'B']);
    expect(c.lessonKinds).toBeUndefined();
  });
  it('keeps stored labels when an approved map is posted back, only for lessons still in the list', () => {
    const c = mapOf(['A', 'B'], { lessonKinds: { A: 'drill', Gone: 'decision', B: 'bogus' } });
    expect(c.lessonKinds).toEqual({ A: 'drill' });
  });
});

describe('goal wizard: roadmap topics with kinds', () => {
  const topic = (curriculum: unknown) => ({ title: 'System Design', area: 'Tech', curriculum });
  const three = (curriculum: unknown) => sanitizeTopics([topic(curriculum), topic(['x1']), topic(['x2'])])!;

  it('reads { title, kind } items into titles plus labels', () => {
    const [t] = three([{ title: 'Choosing a database', kind: 'decision' }, { title: 'Estimation', kind: 'concept' }, { title: 'Caching', kind: 'oops' }]);
    expect(t.curriculum).toEqual(['Choosing a database', 'Estimation', 'Caching']);
    expect(t.curriculumKinds).toEqual({ 'Choosing a database': 'decision', Estimation: 'concept' });
  });
  it('still accepts plain strings and sets no labels', () => {
    const [t] = three(['A', 'B']);
    expect(t.curriculum).toEqual(['A', 'B']);
    expect(t.curriculumKinds).toBeUndefined();
  });
});
