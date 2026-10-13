import { describe, it, expect } from 'vitest';
import { buildOverview, filterOverview, groupByTopic, summarize, type ModuleRowInput } from './lessonOverview';

const mod = (over: Partial<ModuleRowInput> = {}): ModuleRowInput => ({
  topicId: 't1', topicTitle: 'Web', topicStatus: 'active', topicMode: 'syllabus', legacyId: 'm1', title: 'Lesson', order: 1,
  kind: null, blueprint: null, completed: false, estimatedMinutes: 20, ...over,
});

describe('buildOverview', () => {
  it('a module with no saved lesson is not written and needs nothing', () => {
    const [r] = buildOverview([mod()], []);
    expect(r).toMatchObject({ kind: 'concept', written: false, writtenKind: null, needsRegenerate: false, blueprint: [] });
  });

  it('a saved lesson with no kind reads as a concept lesson, so old lessons are never flagged', () => {
    const [r] = buildOverview([mod()], [{ topicId: 't1', moduleId: 'm1', content: { summary: 's' } }]);
    expect(r).toMatchObject({ written: true, writtenKind: 'concept', needsRegenerate: false });
  });

  it('flags a lesson whose kind was changed after it was written', () => {
    const [r] = buildOverview([mod({ kind: 'decision' })], [{ topicId: 't1', moduleId: 'm1', content: { kind: 'concept' } }]);
    expect(r).toMatchObject({ kind: 'decision', writtenKind: 'concept', needsRegenerate: true });
  });

  it('does not flag a lesson written as what it is set to', () => {
    const [r] = buildOverview([mod({ kind: 'survey' })], [{ topicId: 't1', moduleId: 'm1', content: { kind: 'survey' } }]);
    expect(r.needsRegenerate).toBe(false);
  });

  it('matches saved lessons to the right topic and module', () => {
    const rows = buildOverview(
      [mod({ topicId: 'a', legacyId: 'x' }), mod({ topicId: 'b', legacyId: 'x' })],
      [{ topicId: 'b', moduleId: 'x', content: { kind: 'concept' } }],
    );
    expect(rows.map((r) => r.written)).toEqual([false, true]);
  });

  it('treats an unknown stored kind as concept, and drops sections the kind cannot have', () => {
    const [a] = buildOverview([mod({ kind: 'banana' })], []);
    expect(a.kind).toBe('concept');
    const [b] = buildOverview([mod({ kind: 'roadmap', blueprint: ['timeline', 'cost_chart', 'nonsense'] })], []);
    expect(b.blueprint).toEqual(['timeline']);
  });

  it('copes with an odd saved content value', () => {
    const [r] = buildOverview([mod()], [{ topicId: 't1', moduleId: 'm1', content: null }]);
    expect(r.written).toBe(true);
    expect(r.writtenKind).toBe('concept');
  });
});

describe('filterOverview', () => {
  const rows = buildOverview(
    [
      mod({ legacyId: 'a', kind: 'decision' }),
      mod({ legacyId: 'b', kind: 'survey', completed: true }),
      mod({ legacyId: 'c', kind: 'decision' }),
      mod({ legacyId: 'd' }),
    ],
    [
      { topicId: 't1', moduleId: 'a', content: { kind: 'decision' } },
      { topicId: 't1', moduleId: 'b', content: { kind: 'concept' } },
    ],
  );
  const ids = (f: Parameters<typeof filterOverview>[1]) => filterOverview(rows, f).map((r) => r.moduleId);

  it('by kind', () => {
    expect(ids({ kind: 'decision', state: 'all' })).toEqual(['a', 'c']);
    expect(ids({ kind: 'all', state: 'all' })).toEqual(['a', 'b', 'c', 'd']);
  });
  it('by state', () => {
    expect(ids({ kind: 'all', state: 'not_written' })).toEqual(['c', 'd']);
    expect(ids({ kind: 'all', state: 'written' })).toEqual(['a', 'b']);
    expect(ids({ kind: 'all', state: 'needs_regenerate' })).toEqual(['b']);
    expect(ids({ kind: 'all', state: 'done' })).toEqual(['b']);
  });
  it('both together', () => {
    expect(ids({ kind: 'decision', state: 'not_written' })).toEqual(['c']);
  });
});

describe('groupByTopic and summarize', () => {
  const rows = buildOverview(
    [
      mod({ topicId: 'a', topicTitle: 'A', legacyId: 'a2', order: 2 }),
      mod({ topicId: 'b', topicTitle: 'B', legacyId: 'b1', order: 1 }),
      mod({ topicId: 'a', topicTitle: 'A', legacyId: 'a1', order: 1 }),
    ],
    [{ topicId: 'a', moduleId: 'a1', content: { kind: 'concept' } }],
  );

  it('keeps topics in the order they first appear and each topic’s lessons in lesson order', () => {
    const g = groupByTopic(rows);
    expect(g.map((x) => x.topicId)).toEqual(['a', 'b']);
    expect(g[0].rows.map((r) => r.moduleId)).toEqual(['a1', 'a2']);
  });

  it('summarises in plain words', () => {
    expect(summarize(rows)).toBe('3 lessons · 1 written');
    expect(summarize(rows.slice(0, 1))).toBe('1 lesson · 0 written');
    const stale = buildOverview([mod({ kind: 'decision' })], [{ topicId: 't1', moduleId: 'm1', content: { kind: 'concept' } }]);
    expect(summarize(stale)).toBe('1 lesson · 1 written · 1 needs regenerating');
  });
});
