import { describe, it, expect } from 'vitest';
import { topicPauseRowToJson, topicPauseJsonToRowData, type TopicPauseRowLike } from './topicPauseSync';

describe('topicPauseSync mapping', () => {
  it('round-trips the common case', () => {
    const original = {
      id: 'p1',
      pausedAt: '2026-01-01T00:00:00.000Z',
      resumedAt: null,
      reason: 'Switched focus',
      completedConcepts: ['CAP Theorem', 'Sharding'],
      currentConcept: 'Replication',
      openQuestion: 'None',
      reactivationScore: null,
    };
    const rowData = topicPauseJsonToRowData(original);
    const asRow: TopicPauseRowLike = { id: 'row-uuid', ...rowData };
    const back = topicPauseRowToJson(asRow);

    expect(back.id).toBe(original.id);
    expect(back.reason).toBe(original.reason);
    expect(back.completedConcepts).toEqual(original.completedConcepts);
    expect(back.currentConcept).toBe(original.currentConcept);
  });

  it('coerces a numeric reactivationScore (legacy shape) to a string, matching the DB column', () => {
    // The schema comment on TopicPause.reactivationScore notes this field's
    // name is misleading — it's always a descriptive string in practice
    // ("Flagged 2 forgotten"), but the mapper must not choke if an old
    // record somehow has a number.
    const data = topicPauseJsonToRowData({
      id: 'p2', pausedAt: '2026-01-01T00:00:00.000Z', resumedAt: null, reason: null,
      completedConcepts: [], currentConcept: null, openQuestion: null, reactivationScore: 42,
    });
    expect(data.reactivationScore).toBe('42');
  });

  it('defaults a non-array completedConcepts to empty rather than throwing', () => {
    const data = topicPauseJsonToRowData({
      id: 'p3', pausedAt: '2026-01-01T00:00:00.000Z', resumedAt: null, reason: null,
      completedConcepts: undefined as any, currentConcept: null, openQuestion: null, reactivationScore: null,
    });
    expect(data.completedConcepts).toEqual([]);
  });

  it('parses resumedAt when present', () => {
    const data = topicPauseJsonToRowData({
      id: 'p4', pausedAt: '2026-01-01T00:00:00.000Z', resumedAt: '2026-01-05T00:00:00.000Z',
      reason: null, completedConcepts: [], currentConcept: null, openQuestion: null, reactivationScore: null,
    });
    expect(data.resumedAt?.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });
});
