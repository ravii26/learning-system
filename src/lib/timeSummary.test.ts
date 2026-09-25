import { describe, it, expect } from 'vitest';
import { summarizeStudyTime, formatDuration, localDateKey } from './timeSummary';

const NOW = new Date('2026-09-26T10:00:00Z');

describe('localDateKey', () => {
  it('shifts into local time using getTimezoneOffset semantics', () => {
    // 2026-09-25T20:00Z is already the 26th in India (UTC+5:30, offset -330)
    expect(localDateKey(new Date('2026-09-25T20:00:00Z'), -330)).toBe('2026-09-26');
    expect(localDateKey(new Date('2026-09-25T20:00:00Z'), 0)).toBe('2026-09-25');
  });
});

describe('summarizeStudyTime', () => {
  it('returns an all-zero window for no entries', () => {
    const s = summarizeStudyTime([], { now: NOW, days: 3 });
    expect(s).toEqual({
      totalSeconds: 0,
      todaySeconds: 0,
      daily: [{ date: '2026-09-24', seconds: 0 }, { date: '2026-09-25', seconds: 0 }, { date: '2026-09-26', seconds: 0 }],
      byTopic: [],
    });
  });

  it('buckets by day and totals per topic, largest first', () => {
    const s = summarizeStudyTime(
      [
        { topicId: 'dsa', startedAt: '2026-09-26T08:00:00Z', seconds: 1500 },
        { topicId: 'dsa', startedAt: '2026-09-25T08:00:00Z', seconds: 600 },
        { topicId: 'eng', startedAt: '2026-09-26T09:00:00Z', seconds: 300 },
      ],
      { now: NOW, days: 7 }
    );
    expect(s.todaySeconds).toBe(1800);
    expect(s.totalSeconds).toBe(2400);
    expect(s.byTopic).toEqual([{ topicId: 'dsa', seconds: 2100 }, { topicId: 'eng', seconds: 300 }]);
    expect(s.daily[6]).toEqual({ date: '2026-09-26', seconds: 1800 });
    expect(s.daily[5]).toEqual({ date: '2026-09-25', seconds: 600 });
  });

  it('ignores entries outside the window', () => {
    const s = summarizeStudyTime([{ topicId: 'x', startedAt: '2026-08-01T08:00:00Z', seconds: 999 }], { now: NOW, days: 7 });
    expect(s.totalSeconds).toBe(0);
    expect(s.byTopic).toEqual([]);
  });

  it('attributes late-evening study to the local day, not the UTC day', () => {
    // 23:30 IST on the 25th = 18:00Z on the 25th; 00:30 IST on the 26th = 19:00Z on the 25th
    const s = summarizeStudyTime(
      [
        { topicId: 'x', startedAt: '2026-09-25T18:00:00Z', seconds: 60 },
        { topicId: 'x', startedAt: '2026-09-25T19:00:00Z', seconds: 120 },
      ],
      { now: NOW, days: 2, tzOffsetMinutes: -330 }
    );
    expect(s.daily).toEqual([{ date: '2026-09-25', seconds: 60 }, { date: '2026-09-26', seconds: 120 }]);
  });

  it('treats negative or junk seconds as zero', () => {
    const s = summarizeStudyTime([{ topicId: 'x', startedAt: NOW, seconds: -50 }, { topicId: 'x', startedAt: NOW, seconds: NaN }], { now: NOW });
    expect(s.totalSeconds).toBe(0);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [30, '<1m'],
    [60, '1m'],
    [2700, '45m'],
    [3600, '1h'],
    [12000, '3h 20m'],
  ])('%i seconds -> %s', (s, out) => {
    expect(formatDuration(s)).toBe(out);
  });
});
