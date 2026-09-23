import { describe, it, expect } from 'vitest';
import { computeGoalReadiness, READINESS_COMPLETION_THRESHOLD, type ReadinessTopicInput } from './goalReadiness';

const topic = (over: Partial<ReadinessTopicInput> = {}): ReadinessTopicInput => ({
  id: 't1',
  title: 'DSA Patterns',
  status: 'active',
  progressPct: 0,
  required: true,
  ...over,
});

describe('computeGoalReadiness', () => {
  it('returns 0/0 with no topics', () => {
    const r = computeGoalReadiness([]);
    expect(r.met).toBe(0);
    expect(r.total).toBe(0);
    expect(r.criteria).toEqual([]);
  });

  it('ignores non-required links entirely', () => {
    const r = computeGoalReadiness([topic({ required: false, progressPct: 100 })]);
    expect(r.total).toBe(0);
  });

  it('a topic below the threshold and not in maintenance is not met', () => {
    const r = computeGoalReadiness([topic({ progressPct: READINESS_COMPLETION_THRESHOLD - 1, status: 'active' })]);
    expect(r.met).toBe(0);
    expect(r.total).toBe(1);
    expect(r.criteria[0].met).toBe(false);
  });

  it('a topic at or above the threshold is met', () => {
    const r = computeGoalReadiness([topic({ progressPct: READINESS_COMPLETION_THRESHOLD })]);
    expect(r.met).toBe(1);
    expect(computeGoalReadiness([topic({ progressPct: 100 })]).met).toBe(1);
  });

  it('a topic in maintenance is met regardless of progressPct', () => {
    const r = computeGoalReadiness([topic({ status: 'maintenance', progressPct: 5 })]);
    expect(r.met).toBe(1);
  });

  it('a dropped topic below the threshold is not met', () => {
    const r = computeGoalReadiness([topic({ status: 'dropped', progressPct: 0 })]);
    expect(r.met).toBe(0);
  });

  it('mixes met and unmet correctly across several topics', () => {
    const r = computeGoalReadiness([
      topic({ id: 'a', title: 'A', progressPct: 100 }),
      topic({ id: 'b', title: 'B', progressPct: 20 }),
      topic({ id: 'c', title: 'C', status: 'maintenance', progressPct: 0 }),
      topic({ id: 'd', title: 'D', required: false, progressPct: 100 }), // excluded
    ]);
    expect(r.total).toBe(3);
    expect(r.met).toBe(2);
    expect(r.criteria.map((c) => c.topicId)).toEqual(['a', 'b', 'c']);
  });

  it('each criterion carries the topic id and label for linking back', () => {
    const r = computeGoalReadiness([topic({ id: 'xyz', title: 'My Topic' })]);
    expect(r.criteria[0]).toEqual({ topicId: 'xyz', label: 'My Topic', met: false });
  });
});
