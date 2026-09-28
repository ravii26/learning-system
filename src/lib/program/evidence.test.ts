import { describe, it, expect } from 'vitest';
import type { Competency } from '@/data/competencies';
import { evaluateMatrix, checkpointStatus, type EvidenceRows } from './evidence';

const comp = (key: string, kind: Competency['kind']): Competency =>
  ({ key, title: key, group: 'g', kind, importance: 'core', from: 'aware', summary: 's' });
const empty = (): EvidenceRows => ({ attempts: [], problems: [], cards: [], artifacts: [], reps: [] });

describe('evaluateMatrix', () => {
  const comps = [comp('bs', 'algorithm'), comp('talk', 'skill'), comp('proj-project', 'build')];
  const items = [
    { shape: 'course', topicId: 't1', competencyKeys: ['bs'] },
    { shape: 'practice', topicId: 't2', competencyKeys: ['talk'] },
    { shape: 'project', topicId: 't3', competencyKeys: ['proj-project'] },
  ];

  it('is not started with no evidence', () => {
    expect(evaluateMatrix(comps, 'use', items, empty()).map((r) => r.status)).toEqual(['not_started', 'not_started', 'not_started']);
  });

  it('counts evidence per competency through c:<key> module ids, only on program topics', () => {
    const rows = empty();
    rows.attempts.push(
      { topicId: 't1', moduleId: 'c:bs', kind: 'quiz', score: 0.6, verdict: null },
      { topicId: 't1', moduleId: 'c:bs', kind: 'quiz', score: 0.9, verdict: null },
      { topicId: 'other-topic', moduleId: 'c:bs', kind: 'quiz', score: 1, verdict: null }, // not in program: ignored
    );
    rows.cards.push(
      ...Array.from({ length: 3 }, () => ({ topicId: 't1', sourceModuleId: 'c:bs', state: 'Review', reps: 2 })),
      { topicId: 't1', sourceModuleId: 'c:bs', state: 'Learning', reps: 1 }, // not yet recalled days later
    );
    rows.problems.push(
      { topicId: 't1', moduleId: 'c:bs', outcome: 'cold' },
      { topicId: 't1', moduleId: 'c:bs', outcome: 'hint' },
    );
    const bs = evaluateMatrix(comps, 'use', items, rows)[0];
    expect(bs.actual).toMatchObject({ quizBest: 0.9, recallCards: 3, coldProblems: 1 });
    expect(bs.status).toBe('in_progress'); // use-level algorithm needs 2 cold problems
    rows.problems.push({ topicId: 't1', moduleId: 'c:bs', outcome: 'cold' });
    expect(evaluateMatrix(comps, 'use', items, rows)[0].status).toBe('ready');
  });

  it('practice counts reps on the practice topic; project needs an artifact', () => {
    const rows = empty();
    rows.reps.push({ topicId: 't2' }, { topicId: 't2' }, { topicId: 't2' });
    rows.artifacts.push({ topicId: 't3' });
    const m = evaluateMatrix(comps, 'use', items, rows);
    expect(m[1].status).toBe('ready'); // 3 reps at use level
    expect(m[2].actual.project).toBe(true);
    expect(m[2].status).toBe('in_progress'); // still needs its quiz and recall
  });

  it('explore topics share their review cards across the item’s competencies', () => {
    const exploreComps = [comp('a', 'concept'), comp('b', 'concept')];
    const exploreItems = [{ shape: 'exploration', topicId: 'tx', competencyKeys: ['a', 'b'] }];
    const rows = empty();
    rows.cards.push(...Array.from({ length: 4 }, () => ({ topicId: 'tx', sourceModuleId: null, state: 'Review', reps: 2 })));
    const m = evaluateMatrix(exploreComps, 'aware', exploreItems, rows);
    expect(m.map((r) => r.actual.recallCards)).toEqual([2, 2]);
    expect(m.every((r) => r.status === 'ready')).toBe(true); // aware: 2 recalled cards each
  });
});

describe('checkpointStatus', () => {
  const row = (key: string, status: 'not_started' | 'in_progress' | 'ready') => ({ key, status } as any);
  it('is ready only when all its competencies are', () => {
    expect(checkpointStatus(['a', 'b'], [row('a', 'ready'), row('b', 'ready')])).toBe('ready');
    expect(checkpointStatus(['a', 'b'], [row('a', 'ready'), row('b', 'not_started')])).toBe('in_progress');
    expect(checkpointStatus(['a'], [row('a', 'not_started')])).toBe('not_started');
  });
});
