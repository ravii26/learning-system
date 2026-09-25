/**
 * Aggregates StudyTimeEntry rows into "how much time did I actually give"
 * views: today, a per-day series, and per-topic totals. Days are bucketed
 * in the viewer's local time — the client sends its timezone offset
 * (Date.getTimezoneOffset(), minutes, positive west of UTC).
 */

export interface TimeEntryLike {
  topicId: string;
  startedAt: string | Date;
  seconds: number;
}

export interface TimeSummary {
  totalSeconds: number;
  todaySeconds: number;
  daily: Array<{ date: string; seconds: number }>; // oldest -> newest, length = days
  byTopic: Array<{ topicId: string; seconds: number }>; // descending
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar date (YYYY-MM-DD) of an instant, given a getTimezoneOffset() value. */
export function localDateKey(d: Date, tzOffsetMinutes: number): string {
  return new Date(d.getTime() - tzOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

export function summarizeStudyTime(
  entries: TimeEntryLike[],
  { now = new Date(), days = 7, tzOffsetMinutes = 0 }: { now?: Date; days?: number; tzOffsetMinutes?: number } = {}
): TimeSummary {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(localDateKey(new Date(now.getTime() - i * DAY_MS), tzOffsetMinutes));
  const perDay = new Map(keys.map((k) => [k, 0]));
  const perTopic = new Map<string, number>();
  let total = 0;

  for (const e of entries) {
    const seconds = Math.max(0, Math.round(Number(e.seconds) || 0));
    if (!seconds) continue;
    const key = localDateKey(new Date(e.startedAt), tzOffsetMinutes);
    if (!perDay.has(key)) continue; // outside the window
    perDay.set(key, perDay.get(key)! + seconds);
    perTopic.set(e.topicId, (perTopic.get(e.topicId) ?? 0) + seconds);
    total += seconds;
  }

  return {
    totalSeconds: total,
    todaySeconds: perDay.get(keys[keys.length - 1]) ?? 0,
    daily: keys.map((date) => ({ date, seconds: perDay.get(date)! })),
    byTopic: Array.from(perTopic, ([topicId, seconds]) => ({ topicId, seconds })).sort((a, b) => b.seconds - a.seconds),
  };
}

/** "3h 20m", "45m", "<1m", "0m". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return '0m';
  if (s < 60) return '<1m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
