/**
 * Your real pace, measured from study time. Guessed durations stay labelled
 * as estimates until there is enough history to replace them with a range
 * based on how long this kind of lesson actually takes you. Client-safe.
 */

export const MIN_PACE_SAMPLES = 5;
const RECENT_SAMPLES = 10;
const MIN_ACTUAL_SECONDS = 120; // opened and immediately marked finished
const MIN_RATIO = 0.1;
const MAX_RATIO = 6;

export const MIN_CARD_SAMPLES = 10;
const DEFAULT_CARD_SECONDS = 42;

export interface PaceSample {
  kind: string;
  estimatedMinutes: number;
  actualSeconds: number;
  completedAt: Date | string;
}

/** Actual time as a multiple of the estimate: the middle half of recent lessons. */
export interface KindPace {
  low: number;
  high: number;
  count: number;
}
export type PaceByKind = Record<string, KindPace>;

export const paceKey = (kind: string | null | undefined) => kind || 'concept';

function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const below = Math.floor(at);
  const above = Math.ceil(at);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

function ratioOf(s: PaceSample): number | null {
  if (!(s.estimatedMinutes > 0) || s.actualSeconds < MIN_ACTUAL_SECONDS) return null;
  const ratio = s.actualSeconds / 60 / s.estimatedMinutes;
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO ? ratio : null;
}

export function computePaceByKind(samples: PaceSample[]): PaceByKind {
  const byKind = new Map<string, Array<{ ratio: number; at: number }>>();
  for (const s of samples) {
    const ratio = ratioOf(s);
    if (ratio === null) continue;
    const list = byKind.get(paceKey(s.kind)) ?? [];
    list.push({ ratio, at: new Date(s.completedAt).getTime() });
    byKind.set(paceKey(s.kind), list);
  }
  const out: PaceByKind = {};
  byKind.forEach((list, kind) => {
    if (list.length < MIN_PACE_SAMPLES) return;
    const recent = [...list].sort((a, b) => b.at - a.at).slice(0, RECENT_SAMPLES).map((x) => x.ratio).sort((a, b) => a - b);
    out[kind] = { low: quantile(recent, 0.25), high: quantile(recent, 0.75), count: list.length };
  });
  return out;
}

const roundToFive = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

export function personalRange(estimatedMinutes: number, pace: KindPace): { low: number; high: number } {
  const low = roundToFive(estimatedMinutes * pace.low);
  const high = roundToFive(estimatedMinutes * pace.high);
  return { low, high: high > low ? high : low + 5 };
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function formatRange(low: number, high: number): string {
  return high < 60 ? `${low}–${high} min` : `${formatMinutes(low)}–${formatMinutes(high)}`;
}

/** "Usually 10–15 min for you" once measured, "Est. 30 min" until then. */
export function lessonTimeLabel(estimatedMinutes: number, pace: KindPace | undefined, opts: { short?: boolean } = {}): string {
  if (pace) {
    const { low, high } = personalRange(estimatedMinutes, pace);
    return opts.short ? `usually ${formatRange(low, high)}` : `Usually ${formatRange(low, high)} for you`;
  }
  return `${opts.short ? 'est.' : 'Est.'} ${formatMinutes(estimatedMinutes)}`;
}

/** Null when almost no time was recorded, as with a lesson passed by placement. */
export function tookLabel(actualSeconds: number | undefined, estimatedMinutes: number): string | null {
  if (!actualSeconds || actualSeconds < 60) return null;
  return `Took ${formatMinutes(actualSeconds / 60)} · estimate was ${formatMinutes(estimatedMinutes)}`;
}

/** Median seconds per card, or null until enough cards have been timed. */
export function typicalCardSeconds(durationsMs: number[]): number | null {
  if (durationsMs.length < MIN_CARD_SAMPLES) return null;
  return quantile([...durationsMs].sort((a, b) => a - b), 0.5) / 1000;
}

export function reviewMinutes(cardCount: number, cardSeconds: number | null | undefined): number {
  return Math.max(1, Math.ceil((cardCount * (cardSeconds ?? DEFAULT_CARD_SECONDS)) / 60));
}

/** Time actually spent on each lesson up to the moment it was finished. */
export function secondsByModule(
  items: Array<{ topicId: string; legacyId: string; completedAt: Date | null }>,
  entries: Array<{ topicId: string; moduleId: string | null; seconds: number; startedAt: Date }>,
): Map<string, number> {
  const finishedAt = new Map(items.map((i) => [`${i.topicId}|${i.legacyId}`, i.completedAt]));
  const totals = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.topicId}|${e.moduleId}`;
    const end = finishedAt.get(key);
    if (end && e.startedAt <= end) totals.set(key, (totals.get(key) ?? 0) + e.seconds);
  }
  return totals;
}
