import { describe, expect, it } from 'vitest';
import { forecastGoal, remainingWork } from './goalForecast';

const now = new Date('2026-06-01T00:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const daysAhead = (d: number) => new Date(now.getTime() + d * 86_400_000);
// 20 hours left at 2 hours a week: 10 weeks, shown as 8 to 13.
const base = { remainingMinutes: 1200, usedPersonalPace: false, recentSeconds: 8 * 3600, firstStudiedAt: daysAgo(60), deadline: null, now };

describe('forecastGoal', () => {
  it('stays silent with under two weeks of history', () => {
    expect(forecastGoal({ ...base, firstStudiedAt: daysAgo(10) }).status).toBe('not_enough_data');
    expect(forecastGoal({ ...base, firstStudiedAt: null }).status).toBe('not_enough_data');
  });

  it('says so when you have stopped studying the goal', () => {
    expect(forecastGoal({ ...base, recentSeconds: 0 }).status).toBe('no_recent_study');
  });

  it('has nothing to forecast once the work is done', () => {
    expect(forecastGoal({ ...base, remainingMinutes: 0 }).status).toBe('nothing_left');
  });

  it('gives a date range from your recent weekly time', () => {
    const f = forecastGoal(base);
    if (f.status !== 'forecast') throw new Error(f.status);
    expect(f.weeklyMinutes).toBe(120);
    expect(f.finishLow.slice(0, 10)).toBe(daysAhead(56).toISOString().slice(0, 10));
    expect(f.finishHigh.slice(0, 10)).toBe(daysAhead(91).toISOString().slice(0, 10));
    expect(f.verdict).toBeNull();
  });

  it('counts only the weeks you have been studying a newer goal', () => {
    const f = forecastGoal({ ...base, firstStudiedAt: daysAgo(14), recentSeconds: 4 * 3600 });
    if (f.status !== 'forecast') throw new Error(f.status);
    expect(f.weeklyMinutes).toBe(120);
  });

  it.each([
    [120, 'on_track'],
    [70, 'tight'],
    [30, 'not_realistic'],
  ])('with a deadline %i days away says %s', (days, verdict) => {
    const f = forecastGoal({ ...base, deadline: daysAhead(days) });
    if (f.status !== 'forecast') throw new Error(f.status);
    expect(f.verdict).toBe(verdict);
  });

  it('says what weekly time a deadline would take', () => {
    const f = forecastGoal({ ...base, deadline: daysAhead(28) });
    if (f.status !== 'forecast') throw new Error(f.status);
    expect(f.neededWeeklyMinutes).toBe(300);
  });

  it('treats a passed deadline as not realistic', () => {
    const f = forecastGoal({ ...base, deadline: daysAgo(3) });
    if (f.status !== 'forecast') throw new Error(f.status);
    expect(f.verdict).toBe('not_realistic');
    expect(f.neededWeeklyMinutes).toBeNull();
  });

  it('gives no verdict without enough data', () => {
    const f = forecastGoal({ ...base, firstStudiedAt: daysAgo(3), deadline: daysAhead(30) });
    expect(f.status).toBe('not_enough_data');
    expect(f.deadline).toBe(daysAhead(30).toISOString());
  });
});

describe('remainingWork', () => {
  const topics = [{ id: 'a', status: 'active' }];
  const lesson = (over = {}) => ({ topicId: 'a', completed: false, estimatedMinutes: 30, kind: 'concept', ...over });

  it('adds up lessons you have not finished', () => {
    const r = remainingWork({ topics, modules: [lesson(), lesson({ completed: true }), lesson()], planItems: [], pace: {} });
    expect(r).toEqual({ minutes: 60, usedPersonalPace: false });
  });

  it('applies your real pace where it is known', () => {
    const r = remainingWork({ topics, modules: [lesson()], planItems: [], pace: { concept: { low: 0.4, high: 0.6, count: 5 } } });
    expect(r).toEqual({ minutes: 15, usedPersonalPace: true });
  });

  it('uses planned hours for a topic with no lessons yet', () => {
    const r = remainingWork({ topics, modules: [], planItems: [{ topicId: 'a', hoursPerWeek: 2, weeks: 3 }], pace: {} });
    expect(r.minutes).toBe(360);
  });

  it('leaves out topics that are no longer being worked towards', () => {
    const r = remainingWork({ topics: [{ id: 'a', status: 'dropped' }], modules: [lesson()], planItems: [], pace: {} });
    expect(r.minutes).toBe(0);
  });
});
