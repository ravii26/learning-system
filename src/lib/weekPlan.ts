import { TODAY_SIZES, WEEKLY_SESSIONS, planToday, type FocusFacts, type TodaySize } from './focusQueue';
import { paceKey, type PaceByKind } from './pace';

/**
 * Your week: what you've put on which day. You make the plan and the app only
 * drafts it. Unfinished things roll forward rather than piling up. Client-safe.
 */

export interface PlanEntry { focusItemId: string; day: string; position: number }
export interface PlanCell { focusItemId: string; day: string }
export interface WeekPlan { today: string; days: string[]; entries: PlanEntry[] }

const DAY_MS = 86_400_000;
const asUtc = (day: string) => new Date(`${day}T00:00:00Z`);
const asKey = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => asKey(new Date(asUtc(day).getTime() + n * DAY_MS));

/** Monday to Sunday of the week containing `today`. */
export function weekDays(today: string): string[] {
  const sinceMonday = (asUtc(today).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - sinceMonday));
}

export const dayName = (day: string, style: 'short' | 'long' | 'narrow' = 'short') =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: style });

export const perDayFor = (size: TodaySize) => TODAY_SIZES.find((s) => s.key === size)?.items ?? 2;

/** A first draft of the week, from each item's rhythm. Yours to change. */
export function suggestWeek<T extends FocusFacts>(ranked: T[], days: string[], perDay: number): PlanCell[] {
  if (days.length === 0) return [];
  const cells: PlanCell[] = [];
  const load = new Map(days.map((d) => [d, 0]));
  const place = (id: string, day: string) => {
    if (cells.some((c) => c.focusItemId === id && c.day === day)) return;
    cells.push({ focusItemId: id, day });
    load.set(day, (load.get(day) ?? 0) + 1);
  };
  const hasRoom = (day: string) => (load.get(day) ?? 0) < perDay;
  const roomNear = (index: number) => {
    for (let offset = 0; offset < days.length; offset++) {
      const day = days[(index + offset) % days.length];
      if (hasRoom(day)) return day;
    }
    return null;
  };

  const open = ranked.filter((i) => !i.finished);
  for (const item of open.filter((i) => i.rhythm === 'daily')) days.forEach((d) => place(item.id, d));
  for (const item of open) {
    if (item.rhythm === 'daily' || item.rhythm === 'when_i_can') continue;
    if (item.rhythm === 'few_weekly') {
      const need = Math.min(Math.max(1, WEEKLY_SESSIONS - item.sessionsThisWeek), days.length);
      for (let n = 0; n < need; n++) {
        const day = roomNear(Math.floor((n * days.length) / need));
        if (day) place(item.id, day);
      }
    } else {
      const day = roomNear(0);
      if (day) place(item.id, day);
    }
  }
  for (const item of open.filter((i) => i.rhythm === 'when_i_can')) {
    const day = [...days].reverse().find(hasRoom);
    if (day) place(item.id, day);
  }
  return cells;
}

/** Still waiting: from before today, and nothing has been done on it since. */
export function isUnresolved(entry: PlanEntry, item: FocusFacts | undefined, today: string): boolean {
  if (entry.day >= today || !item || item.finished) return false;
  return !(item.doneDays ?? []).some((d) => d >= entry.day);
}

export interface DayView<T> {
  /** True when you haven't planned, so the list is the app's suggestion. */
  suggested: boolean;
  list: T[];
  done: T[];
  others: T[];
  reviewOpen: boolean;
  doneCount: number;
  total: number;
  /** Item id to the earlier day it rolled forward from. */
  carriedFrom: Record<string, string>;
}

export function planDayView<T extends FocusFacts>(
  ranked: T[],
  plan: WeekPlan,
  options: { size: TodaySize; extra: number; review: { due: number; reviewedToday: boolean } },
): DayView<T> {
  const byId = new Map(ranked.map((i) => [i.id, i]));
  const planned = plan.entries.some((e) => e.day >= plan.today && plan.days.includes(e.day))
    || plan.entries.some((e) => isUnresolved(e, byId.get(e.focusItemId), plan.today));
  const addedToday = ranked.some((i) => i.addedToday);

  if (!planned && !addedToday) {
    return { ...planToday(ranked, options.size, options.extra, options.review), suggested: true, carriedFrom: {} };
  }

  const carriedFrom: Record<string, string> = {};
  for (const e of [...plan.entries].sort((a, b) => a.day.localeCompare(b.day))) {
    if (isUnresolved(e, byId.get(e.focusItemId), plan.today) && !carriedFrom[e.focusItemId]) carriedFrom[e.focusItemId] = e.day;
  }
  const todays = plan.entries.filter((e) => e.day === plan.today).sort((a, b) => a.position - b.position).map((e) => e.focusItemId);
  const orderedIds = Array.from(new Set([...Object.keys(carriedFrom), ...todays, ...ranked.filter((i) => i.addedToday).map((i) => i.id)]));
  const isOpen = (i: T) => !i.doneToday && !i.finished && !i.skippedToday;

  const onPlan = orderedIds.map((id) => byId.get(id)).filter((i): i is T => !!i && isOpen(i));
  const onPlanIds = new Set(onPlan.map((i) => i.id));
  const rest = ranked.filter((i) => isOpen(i) && !onPlanIds.has(i.id));
  const done = ranked.filter((i) => i.doneToday);
  const list = [...onPlan, ...rest.slice(0, options.extra)];
  const others = rest.slice(options.extra);

  const reviewOpen = options.review.due > 0;
  const doneCount = done.length + (!reviewOpen && options.review.reviewedToday ? 1 : 0);
  return { suggested: false, list, done, others, reviewOpen, doneCount, total: doneCount + list.length + (reviewOpen ? 1 : 0), carriedFrom };
}

/** Only speaks up from your real pace and a target you set; guesses stay quiet. */
export function dayLooksFull(
  items: Array<{ estimatedMinutes: number | null; lessonKind: string | null }>,
  pace: PaceByKind,
  weeklyTargetMinutes: number | null,
  plannedDays: number,
): boolean {
  if (!weeklyTargetMinutes || plannedDays === 0 || items.length === 0) return false;
  let total = 0;
  for (const item of items) {
    const measured = pace[paceKey(item.lessonKind)];
    if (!item.estimatedMinutes || !measured) return false;
    total += item.estimatedMinutes * ((measured.low + measured.high) / 2);
  }
  return total > (weeklyTargetMinutes / plannedDays) * 1.5;
}
