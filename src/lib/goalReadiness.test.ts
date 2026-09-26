import { describe, it, expect } from 'vitest';
import { computeGoalReadiness, READINESS_COMPLETION_THRESHOLD, type ReadinessTopicInput, type ReadinessEvidence } from './goalReadiness';

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
    expect(r.criteria[0]).toMatchObject({ topicId: 'xyz', label: 'My Topic', met: false });
  });
});

describe('computeGoalReadiness with evidence', () => {
  const ev = (counts: Partial<ReadinessEvidence['counts']>, problemsCold = 0, unit: 'module' | 'idea' = 'module'): ReadinessEvidence => ({
    unit,
    counts: { unseen: 0, learning: 0, solid: 0, fading: 0, ...counts },
    problemsCold,
  });

  it('needs 80% of modules solid, whatever progress % says', () => {
    const r = computeGoalReadiness([topic({ progressPct: 100, evidence: ev({ solid: 7, learning: 3 }) })]);
    expect(r.criteria[0]).toMatchObject({ met: false, reason: '7 of 8 modules solid' });
    expect(computeGoalReadiness([topic({ evidence: ev({ solid: 8, learning: 2 }) })]).met).toBe(1);
  });

  it('is not met while anything is slipping, even if marked done', () => {
    const r = computeGoalReadiness([topic({ status: 'maintenance', evidence: ev({ solid: 9, fading: 1 }) })]);
    expect(r.criteria[0]).toMatchObject({ met: false, reason: '1 slipping' });
  });

  it('interview-ready also needs problems solved cold', () => {
    const t = (cold: number) => topic({ depthTarget: 'Deep', evidence: ev({ solid: 10 }, cold) });
    expect(computeGoalReadiness([t(2)]).criteria[0]).toMatchObject({ met: false, reason: '2 of 5 problems solved cold' });
    expect(computeGoalReadiness([t(5)]).met).toBe(1);
  });

  it('idea topics are ready when nothing is slipping', () => {
    expect(computeGoalReadiness([topic({ evidence: ev({ solid: 4 }, 0, 'idea') })]).met).toBe(1);
    expect(computeGoalReadiness([topic({ evidence: ev({ solid: 4, fading: 1 }, 0, 'idea') })]).met).toBe(0);
  });

  it('falls back to the old rule when there is no evidence', () => {
    expect(computeGoalReadiness([topic({ status: 'maintenance', evidence: ev({}) })]).met).toBe(1);
  });
});
