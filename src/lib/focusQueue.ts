/**
 * What goes on Today's list. Deliberately plain and deterministic: anything
 * close to its date first, then what its rhythm says is due, then whatever
 * has been left longest. Every pick carries a reason in everyday words.
 * Client-safe.
 */

export type Rhythm = 'daily' | 'few_weekly' | 'when_i_can' | 'by_date' | 'once';

export const RHYTHMS: Array<{ key: Rhythm; label: string }> = [
  { key: 'daily', label: 'Every day' },
  { key: 'few_weekly', label: 'A few times a week' },
  { key: 'when_i_can', label: 'When I can' },
  { key: 'by_date', label: 'By a date' },
  { key: 'once', label: 'Just once' },
];
export const RHYTHM_LABEL = Object.fromEntries(RHYTHMS.map((r) => [r.key, r.label])) as Record<Rhythm, string>;
export const isRhythm = (v: unknown): v is Rhythm => typeof v === 'string' && v in RHYTHM_LABEL;

export type TodaySize = 'quick' | 'normal' | 'deep';
export const TODAY_SIZES: Array<{ key: TodaySize; label: string; items: number }> = [
  { key: 'quick', label: 'Quick', items: 1 },
  { key: 'normal', label: 'Normal', items: 2 },
  { key: 'deep', label: 'Deep', items: 4 },
];

/** Beyond this many pins, tell the learner that items will take turns. */
export const ROTATION_WARNING_AT = 6;

const DEADLINE_WINDOW_DAYS = 14;
export const WEEKLY_SESSIONS = 3;
const DAY_MS = 86_400_000;

export interface FocusFacts {
  id: string;
  rhythm: Rhythm;
  targetDate: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  sessionsThisWeek: number;
  doneToday: boolean;
  skippedToday: boolean;
  addedToday: boolean;
  finished: boolean;
}

export type Ranked<T> = T & { tier: number; reason: string };

function deadlineReason(days: number): string {
  if (days < 0) return 'Past its date';
  if (days === 0) return 'Due today';
  return days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
}

function neglectReason(days: number, touched: boolean): string {
  if (!touched) return 'New in your Focus';
  if (days <= 0) return 'Studied today';
  return days === 1 ? 'Not studied since yesterday' : `Not studied in ${days} days`;
}

function assess(item: FocusFacts, now: Date): { tier: number; reason: string; dueAt: number; idleDays: number } {
  const anchor = item.lastActivityAt ?? item.createdAt;
  const idleDays = Math.max(0, Math.floor((now.getTime() - new Date(anchor).getTime()) / DAY_MS));
  const dueAt = item.targetDate ? new Date(item.targetDate).getTime() : Number.POSITIVE_INFINITY;
  // Rounded, because dates are stored at noon: a few hours mustn't add a day.
  const daysToDeadline = item.targetDate ? Math.round((dueAt - now.getTime()) / DAY_MS) : null;

  if (daysToDeadline !== null && daysToDeadline <= DEADLINE_WINDOW_DAYS) {
    return { tier: 0, reason: deadlineReason(daysToDeadline), dueAt, idleDays };
  }
  if (item.rhythm === 'daily') return { tier: 1, reason: 'Daily habit', dueAt, idleDays };
  if (item.rhythm === 'once') return { tier: 1, reason: 'One-time task', dueAt, idleDays };
  if (item.rhythm === 'few_weekly' && item.sessionsThisWeek < WEEKLY_SESSIONS) {
    const reason = idleDays >= 2 || !item.lastActivityAt
      ? neglectReason(idleDays, !!item.lastActivityAt)
      : `${item.sessionsThisWeek} of ${WEEKLY_SESSIONS} times this week`;
    return { tier: 1, reason, dueAt, idleDays };
  }
  if (item.rhythm === 'when_i_can') return { tier: 3, reason: 'You have room for it', dueAt, idleDays };
  if (item.rhythm === 'by_date' && daysToDeadline !== null) return { tier: 2, reason: deadlineReason(daysToDeadline), dueAt, idleDays };
  return { tier: 2, reason: neglectReason(idleDays, !!item.lastActivityAt), dueAt, idleDays };
}

/** Best next first: by date within deadlines, otherwise the longest left alone. */
export function rankFocus<T extends FocusFacts>(items: T[], now: Date = new Date()): Array<Ranked<T>> {
  return items
    .map((item) => ({ item, ...assess(item, now) }))
    .sort((a, b) => a.tier - b.tier || (a.tier === 0 ? a.dueAt - b.dueAt : b.idleDays - a.idleDays))
    .map(({ item, tier, reason }) => ({ ...item, tier, reason }));
}

export interface TodayPick<T> {
  /** What's on the list right now. */
  list: T[];
  done: T[];
  /** Everything else that could still be done today. */
  others: T[];
}

/**
 * `extra` is how many times you've chosen Keep going. Things you added for
 * today always stay on the list, and finished items use up the day's room.
 */
export function pickToday<T extends FocusFacts>(ranked: T[], size: TodaySize, extra = 0): TodayPick<T> {
  const capacity = (TODAY_SIZES.find((s) => s.key === size)?.items ?? 2) + extra;
  const done = ranked.filter((i) => i.doneToday);
  const open = ranked.filter((i) => !i.doneToday && !i.finished && !i.skippedToday);
  const added = open.filter((i) => i.addedToday);
  const rest = open.filter((i) => !i.addedToday);
  const room = Math.max(0, capacity - done.length - added.length);
  return { list: [...added, ...rest.slice(0, room)], done, others: rest.slice(room) };
}
