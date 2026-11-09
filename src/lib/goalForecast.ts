import { paceKey, type PaceByKind } from './pace';

/**
 * When a goal might finish, from how you have actually been studying it.
 * Stays silent until there are two weeks of history, so it never presents a
 * guess as a forecast. Client-safe.
 */

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const MIN_HISTORY_DAYS = 14;
export const RECENT_DAYS = 28;
const LOW_BAND = 0.8;
const HIGH_BAND = 1.3;
const NOT_COUNTED = new Set(['dropped', 'reference', 'maintenance']);

export interface RemainingInput {
  topics: Array<{ id: string; status: string }>;
  modules: Array<{ topicId: string; completed: boolean; estimatedMinutes: number; kind: string }>;
  planItems: Array<{ topicId: string | null; hoursPerWeek: number; weeks: number }>;
  pace: PaceByKind;
}

export function remainingWork(input: RemainingInput): { minutes: number; usedPersonalPace: boolean } {
  let minutes = 0;
  let usedPersonalPace = false;
  for (const topic of input.topics) {
    if (NOT_COUNTED.has(topic.status)) continue;
    const modules = input.modules.filter((m) => m.topicId === topic.id);
    if (modules.length === 0) {
      // A topic whose lessons aren't written yet still has its planned time.
      const item = input.planItems.find((i) => i.topicId === topic.id);
      if (item) minutes += item.hoursPerWeek * item.weeks * 60;
      continue;
    }
    for (const m of modules) {
      if (m.completed) continue;
      const pace = input.pace[paceKey(m.kind)];
      if (pace) usedPersonalPace = true;
      minutes += m.estimatedMinutes * (pace ? (pace.low + pace.high) / 2 : 1);
    }
  }
  return { minutes: Math.round(minutes), usedPersonalPace };
}

export type DeadlineVerdict = 'on_track' | 'tight' | 'not_realistic';

export type GoalForecast =
  | { status: 'not_enough_data'; deadline: string | null }
  | { status: 'no_recent_study'; deadline: string | null }
  | { status: 'nothing_left'; deadline: string | null }
  | {
    status: 'forecast';
    deadline: string | null;
    finishLow: string;
    finishHigh: string;
    weeksHigh: number;
    weeklyMinutes: number;
    remainingMinutes: number;
    usedPersonalPace: boolean;
    verdict: DeadlineVerdict | null;
    /** Weekly time the deadline would take; null without a deadline or once it has passed. */
    neededWeeklyMinutes: number | null;
  };

export function forecastGoal(input: {
  remainingMinutes: number;
  usedPersonalPace: boolean;
  recentSeconds: number;
  firstStudiedAt: Date | null;
  deadline: Date | null;
  now?: Date;
}): GoalForecast {
  const now = input.now ?? new Date();
  const deadline = input.deadline ? input.deadline.toISOString() : null;
  if (input.remainingMinutes <= 0) return { status: 'nothing_left', deadline };
  if (!input.firstStudiedAt) return { status: 'not_enough_data', deadline };

  const historyDays = (now.getTime() - input.firstStudiedAt.getTime()) / DAY_MS;
  if (historyDays < MIN_HISTORY_DAYS) return { status: 'not_enough_data', deadline };
  if (input.recentSeconds <= 0) return { status: 'no_recent_study', deadline };

  const weeksObserved = Math.min(RECENT_DAYS, historyDays) / WEEK_DAYS;
  const weeklyMinutes = input.recentSeconds / 60 / weeksObserved;
  const weeks = input.remainingMinutes / weeklyMinutes;
  const finish = (w: number) => new Date(now.getTime() + w * WEEK_DAYS * DAY_MS);
  const finishLow = finish(weeks * LOW_BAND);
  const finishHigh = finish(weeks * HIGH_BAND);

  let verdict: DeadlineVerdict | null = null;
  let neededWeeklyMinutes: number | null = null;
  if (input.deadline) {
    verdict = finishHigh <= input.deadline ? 'on_track' : finishLow <= input.deadline ? 'tight' : 'not_realistic';
    const weeksLeft = (input.deadline.getTime() - now.getTime()) / (WEEK_DAYS * DAY_MS);
    if (weeksLeft > 0) neededWeeklyMinutes = Math.round(input.remainingMinutes / weeksLeft);
  }

  return {
    status: 'forecast',
    deadline,
    finishLow: finishLow.toISOString(),
    finishHigh: finishHigh.toISOString(),
    weeksHigh: weeks * HIGH_BAND,
    weeklyMinutes: Math.round(weeklyMinutes),
    remainingMinutes: input.remainingMinutes,
    usedPersonalPace: input.usedPersonalPace,
    verdict,
    neededWeeklyMinutes,
  };
}
