import { describe, it, expect } from 'vitest';
import { computeAccretionStats } from './accretionStats';

const NOW = new Date('2026-09-24T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86400000);

describe('computeAccretionStats', () => {
  it('handles an empty note base', () => {
    const s = computeAccretionStats([], NOW);
    expect(s).toEqual({ noteCount: 0, linkCount: 0, weekly: [0, 0, 0, 0, 0, 0, 0, 0], addedThisWeek: 0, densest: null, thinnest: null });
  });

  it('buckets notes by week, oldest first, newest last', () => {
    const s = computeAccretionStats([
      { createdAt: ago(1), tags: [] },
      { createdAt: ago(2), tags: [] },
      { createdAt: ago(8), tags: [] },
      { createdAt: ago(50), tags: [] },
    ], NOW);
    // 50 days ago = week 7 counting back = the oldest of the 8 buckets
    expect(s.weekly).toEqual([1, 0, 0, 0, 0, 0, 1, 2]);
    expect(s.addedThisWeek).toBe(2);
  });

  it('ignores notes older than the window for the series but still counts them', () => {
    const s = computeAccretionStats([{ createdAt: ago(200), tags: [] }], NOW);
    expect(s.weekly.reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.noteCount).toBe(1);
  });

  it('counts each link once (outgoing only)', () => {
    const s = computeAccretionStats([
      { createdAt: ago(1), tags: [], _count: { outgoing: 2, incoming: 0 } },
      { createdAt: ago(1), tags: [], _count: { outgoing: 0, incoming: 2 } },
    ], NOW);
    expect(s.linkCount).toBe(2);
  });

  it('finds densest and thinnest tag clusters', () => {
    const s = computeAccretionStats([
      { createdAt: ago(1), tags: ['valuation', 'moats'] },
      { createdAt: ago(1), tags: ['valuation'] },
      { createdAt: ago(1), tags: ['valuation', 'macro'] },
      { createdAt: ago(1), tags: ['moats'] },
    ], NOW);
    expect(s.densest).toEqual({ tag: 'valuation', count: 3 });
    expect(s.thinnest).toEqual({ tag: 'macro', count: 1 });
  });

  it('reports no thinnest cluster when there is only one tag', () => {
    const s = computeAccretionStats([{ createdAt: ago(1), tags: ['a'] }, { createdAt: ago(1), tags: ['a'] }], NOW);
    expect(s.densest).toEqual({ tag: 'a', count: 2 });
    expect(s.thinnest).toBeNull();
  });

  it('does not double-count a tag repeated on one note', () => {
    const s = computeAccretionStats([{ createdAt: ago(1), tags: ['a', 'a'] }], NOW);
    expect(s.densest).toEqual({ tag: 'a', count: 1 });
  });
});
