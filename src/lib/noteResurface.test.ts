import { describe, it, expect } from 'vitest';
import { pickNoteToResurface } from './noteResurface';

const NOW = new Date('2026-09-24T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86400000);
const note = (id: string, createdDaysAgo: number, updatedDaysAgo: number, resurfacedDaysAgo: number | null) => ({
  id, title: id, createdAt: ago(createdDaysAgo), updatedAt: ago(updatedDaysAgo),
  lastResurfacedAt: resurfacedDaysAgo === null ? null : ago(resurfacedDaysAgo),
});

describe('pickNoteToResurface', () => {
  it('returns null when there are no notes', () => {
    expect(pickNoteToResurface([], NOW)).toBeNull();
  });

  it('skips notes younger than 3 days — too fresh to resurface', () => {
    expect(pickNoteToResurface([note('new', 1, 1, null)], NOW)).toBeNull();
  });

  it('skips notes resurfaced within the last 14 days', () => {
    expect(pickNoteToResurface([note('recent', 30, 30, 5)], NOW)).toBeNull();
  });

  it('prefers a never-resurfaced note over one resurfaced long ago', () => {
    const pick = pickNoteToResurface([note('old-seen', 60, 60, 30), note('never', 10, 10, null)], NOW);
    expect(pick?.id).toBe('never');
  });

  it('among resurfaced notes, picks the one seen least recently', () => {
    const pick = pickNoteToResurface([note('a', 90, 90, 20), note('b', 90, 90, 40)], NOW);
    expect(pick?.id).toBe('b');
  });

  it('breaks ties by the oldest edit', () => {
    const pick = pickNoteToResurface([note('fresh-edit', 50, 2, null), note('stale-edit', 50, 40, null)], NOW);
    expect(pick?.id).toBe('stale-edit');
  });

  it('is deterministic for the same inputs', () => {
    const notes = [note('x', 20, 20, null), note('y', 20, 20, null)];
    expect(pickNoteToResurface(notes, NOW)?.id).toBe(pickNoteToResurface(notes, NOW)?.id);
  });

  it('accepts ISO string dates, as the API returns', () => {
    const n = { id: 's', title: 's', createdAt: ago(10).toISOString(), updatedAt: ago(10).toISOString(), lastResurfacedAt: null };
    expect(pickNoteToResurface([n], NOW)?.id).toBe('s');
  });
});
