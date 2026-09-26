import { describe, it, expect, vi } from 'vitest';

vi.mock('./db', () => ({ db: {} }));

import { assembleTopicKnowledge, type KnowledgeRows } from './topicKnowledge';

const NOW = new Date('2026-09-26T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

const empty: KnowledgeRows = { topics: [], modules: [], attempts: [], cards: [], time: [] };

describe('assembleTopicKnowledge', () => {
  it('measures a course topic per module, in syllabus order', () => {
    const rows: KnowledgeRows = {
      ...empty,
      topics: [{ id: 't1', mode: 'syllabus' }],
      modules: [
        { topicId: 't1', legacyId: 'm2', title: 'Two', order: 2, completed: false },
        { topicId: 't1', legacyId: 'm1', title: 'One', order: 1, completed: true },
      ],
      attempts: [{ topicId: 't1', moduleId: 'm1', kind: 'quiz', score: 1, verdict: null, createdAt: daysAgo(3) }],
    };
    const k = assembleTopicKnowledge(rows, NOW).get('t1')!;
    expect(k.unit).toBe('module');
    expect(k.items.map((i) => [i.id, i.state])).toEqual([
      ['m1', 'solid'],
      ['m2', 'unseen'],
    ]);
    expect(k.counts).toEqual({ unseen: 1, learning: 0, solid: 1, fading: 0 });
  });

  it('uses only the latest attempt of each kind', () => {
    const rows: KnowledgeRows = {
      ...empty,
      topics: [{ id: 't1', mode: 'syllabus' }],
      modules: [{ topicId: 't1', legacyId: 'm1', title: 'One', order: 1, completed: true }],
      attempts: [
        { topicId: 't1', moduleId: 'm1', kind: 'quiz', score: 1, verdict: null, createdAt: daysAgo(5) },
        { topicId: 't1', moduleId: 'm1', kind: 'quiz', score: 0.25, verdict: null, createdAt: daysAgo(1) },
      ],
    };
    expect(assembleTopicKnowledge(rows, NOW).get('t1')!.items[0].state).toBe('learning');
  });

  it('attributes cards and time to their own module only', () => {
    const rows: KnowledgeRows = {
      ...empty,
      topics: [{ id: 't1', mode: 'syllabus' }],
      modules: [
        { topicId: 't1', legacyId: 'm1', title: 'One', order: 1, completed: false },
        { topicId: 't1', legacyId: 'm2', title: 'Two', order: 2, completed: false },
      ],
      cards: [{ id: 'c1', topicId: 't1', title: 'Card', sourceModuleId: 'm2', state: 'New', reps: 0, stability: null, lastReview: null }],
      time: [{ topicId: 't1', moduleId: 'm1', seconds: 300 }],
    };
    const states = assembleTopicKnowledge(rows, NOW).get('t1')!.items.map((i) => i.state);
    expect(states).toEqual(['learning', 'learning']);
  });

  it('measures a topic with no syllabus per idea', () => {
    const rows: KnowledgeRows = {
      ...empty,
      topics: [{ id: 't2', mode: 'accretion' }],
      cards: [
        { id: 'a', topicId: 't2', title: 'Moats', sourceModuleId: null, state: 'Review', reps: 2, stability: 20, lastReview: daysAgo(2) },
        { id: 'b', topicId: 't2', title: 'Margin of safety', sourceModuleId: null, state: 'Review', reps: 3, stability: 3, lastReview: daysAgo(60) },
        { id: 'c', topicId: 't2', title: 'DCF', sourceModuleId: null, state: 'New', reps: 0, stability: null, lastReview: null },
      ],
    };
    const k = assembleTopicKnowledge(rows, NOW).get('t2')!;
    expect(k.unit).toBe('idea');
    expect(k.counts).toEqual({ unseen: 0, learning: 1, solid: 1, fading: 1 });
  });
});
