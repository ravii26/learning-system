/**
 * Picks one note to show back to you — accretion mode's answer to spaced
 * review. Notes have no grade/FSRS state, so the rule is simple and
 * explainable: only notes at least MIN_AGE_DAYS old are eligible, anything
 * resurfaced in the last RESURFACE_GAP_DAYS is skipped, and among the rest
 * the one you've seen least recently wins (never-resurfaced first, then
 * oldest lastResurfacedAt; ties broken by the oldest edit). Pure and
 * deterministic so it's testable and a reload shows the same note.
 */

export interface NoteForResurface {
  id: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  lastResurfacedAt: string | Date | null;
}

export const MIN_AGE_DAYS = 3;
export const RESURFACE_GAP_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

const t = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d).getTime();

export function pickNoteToResurface<N extends NoteForResurface>(notes: N[], now: Date = new Date()): N | null {
  const nowMs = now.getTime();
  const eligible = notes.filter((n) => {
    if (nowMs - t(n.createdAt) < MIN_AGE_DAYS * DAY) return false;
    if (n.lastResurfacedAt && nowMs - t(n.lastResurfacedAt) < RESURFACE_GAP_DAYS * DAY) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const la = a.lastResurfacedAt ? t(a.lastResurfacedAt) : -Infinity;
    const lb = b.lastResurfacedAt ? t(b.lastResurfacedAt) : -Infinity;
    if (la !== lb) return la - lb;
    return t(a.updatedAt) - t(b.updatedAt);
  });
  return eligible[0];
}
