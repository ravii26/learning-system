import { describe, expect, it } from 'vitest';
import type { FocusFacts } from './focusQueue';
import { addDays, dayLooksFull, isUnresolved, planDayView, suggestWeek, weekDays, type WeekPlan } from './weekPlan';

const item = (id: string, over: Partial<FocusFacts> = {}): FocusFacts => ({
  id, rhythm: 'few_weekly', targetDate: null, createdAt: '2026-01-01T00:00:00Z', lastActivityAt: null,
  sessionsThisWeek: 0, doneToday: false, skippedToday: false, addedToday: false, finished: false, ...over,
});
const review = { due: 0, reviewedToday: false };
const options = { size: 'normal' as const, extra: 0, review };
const days = weekDays('2026-11-11'); // a Wednesday
const plan = (over: Partial<WeekPlan>): WeekPlan => ({ today: '2026-11-11', days, entries: [], ...over });
const ids = (l: Array<{ id: string }>) => l.map((i) => i.id);

describe('weekDays', () => {
  it('runs Monday to Sunday', () => {
    expect(days[0]).toBe('2026-11-09');
    expect(days[6]).toBe('2026-11-15');
  });

  it('treats Sunday as the end of its week', () => {
    expect(weekDays('2026-11-15')[0]).toBe('2026-11-09');
  });

  it('crosses month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('suggestWeek', () => {
  const remaining = days.slice(2); // Wed to Sun
  const onDay = (cells: Array<{ focusItemId: string; day: string }>, id: string) => cells.filter((c) => c.focusItemId === id).map((c) => c.day);

  it('puts a daily item on every remaining day', () => {
    expect(onDay(suggestWeek([item('a', { rhythm: 'daily' })], remaining, 2), 'a')).toEqual(remaining);
  });

  it('spreads a few-times-a-week item out', () => {
    const placed = onDay(suggestWeek([item('a')], remaining, 2), 'a');
    expect(placed).toHaveLength(3);
    expect(new Set(placed).size).toBe(3);
  });

  it('asks for less once some sessions are done', () => {
    expect(onDay(suggestWeek([item('a', { sessionsThisWeek: 2 })], remaining, 2), 'a')).toHaveLength(1);
  });

  it('respects how much fits in a day', () => {
    const cells = suggestWeek(['a', 'b', 'c', 'd'].map((id) => item(id, { rhythm: 'once' })), remaining.slice(0, 2), 2);
    expect(cells).toHaveLength(4);
    expect(suggestWeek(['a', 'b', 'c'].map((id) => item(id, { rhythm: 'once' })), remaining.slice(0, 1), 2)).toHaveLength(2);
  });

  it('gives "when I can" only leftover room, late in the week', () => {
    expect(onDay(suggestWeek([item('a', { rhythm: 'when_i_can' })], remaining, 2), 'a')).toEqual([remaining[4]]);
  });

  it('leaves out finished items', () => {
    expect(suggestWeek([item('a', { finished: true })], remaining, 2)).toEqual([]);
  });
});

describe('isUnresolved', () => {
  const entry = { focusItemId: 'a', day: '2026-11-09', position: 0 };

  it('is true for something from before today with nothing done since', () => {
    expect(isUnresolved(entry, item('a'), '2026-11-11')).toBe(true);
  });

  it('is false once done that day or later', () => {
    expect(isUnresolved(entry, item('a', { doneDays: ['2026-11-10'] }), '2026-11-11')).toBe(false);
  });

  it('ignores work from before the planned day', () => {
    expect(isUnresolved(entry, item('a', { doneDays: ['2026-11-08'] }), '2026-11-11')).toBe(true);
  });

  it('is false for today and later', () => {
    expect(isUnresolved({ ...entry, day: '2026-11-11' }, item('a'), '2026-11-11')).toBe(false);
  });
});

describe('planDayView', () => {
  it('suggests when you have not planned', () => {
    const v = planDayView([item('a'), item('b'), item('c')], plan({}), options);
    expect(v.suggested).toBe(true);
    expect(v.list).toHaveLength(2);
  });

  it('shows what you planned for today, in your order', () => {
    const v = planDayView([item('a'), item('b'), item('c')], plan({ entries: [{ focusItemId: 'c', day: '2026-11-11', position: 0 }, { focusItemId: 'a', day: '2026-11-11', position: 1 }] }), options);
    expect(v.suggested).toBe(false);
    expect(ids(v.list)).toEqual(['c', 'a']);
    expect(ids(v.others)).toEqual(['b']);
  });

  it('rolls unfinished things forward, once each', () => {
    const entries = [{ focusItemId: 'a', day: '2026-11-09', position: 0 }, { focusItemId: 'a', day: '2026-11-10', position: 0 }];
    const v = planDayView([item('a')], plan({ entries }), options);
    expect(ids(v.list)).toEqual(['a']);
    expect(v.carriedFrom.a).toBe('2026-11-09');
  });

  it('leaves today empty when your plan puts nothing here', () => {
    const v = planDayView([item('a')], plan({ entries: [{ focusItemId: 'a', day: '2026-11-13', position: 0 }] }), options);
    expect(v.suggested).toBe(false);
    expect(v.list).toEqual([]);
    expect(ids(v.others)).toEqual(['a']);
  });

  it('adds one more when you keep going', () => {
    const v = planDayView([item('a')], plan({ entries: [{ focusItemId: 'a', day: '2026-11-13', position: 0 }] }), { ...options, extra: 1 });
    expect(ids(v.list)).toEqual(['a']);
  });

  it('honours skipping and counts what is done', () => {
    const entries = ['a', 'b', 'c'].map((id, position) => ({ focusItemId: id, day: '2026-11-11', position }));
    const v = planDayView([item('a', { doneToday: true }), item('b', { skippedToday: true }), item('c')], plan({ entries }), options);
    expect(ids(v.list)).toEqual(['c']);
    expect(v).toMatchObject({ doneCount: 1, total: 2 });
  });

  it('counts review as a step', () => {
    const v = planDayView([item('a')], plan({ entries: [{ focusItemId: 'a', day: '2026-11-11', position: 0 }] }), { ...options, review: { due: 4, reviewedToday: false } });
    expect(v).toMatchObject({ reviewOpen: true, total: 2 });
  });
});

describe('dayLooksFull', () => {
  const pace = { concept: { low: 1, high: 1, count: 5 } };
  const lesson = { estimatedMinutes: 60, lessonKind: 'concept' };

  it('stays quiet without real pace or a target', () => {
    expect(dayLooksFull([lesson], {}, 300, 5)).toBe(false);
    expect(dayLooksFull([lesson], pace, null, 5)).toBe(false);
  });

  it('warns when measured time is well over your share', () => {
    expect(dayLooksFull([lesson, lesson], pace, 300, 5)).toBe(true);
    expect(dayLooksFull([lesson], pace, 300, 5)).toBe(false);
  });
});
