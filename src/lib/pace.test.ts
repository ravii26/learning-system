import { describe, expect, it } from 'vitest';
import { computePaceByKind, lessonTimeLabel, personalRange, reviewMinutes, secondsByModule, tookLabel, typicalCardSeconds, type PaceSample } from './pace';

const sample = (minutes: number, over: Partial<PaceSample> = {}, i = 0): PaceSample => ({
  kind: 'concept', estimatedMinutes: 30, actualSeconds: minutes * 60, completedAt: new Date(2026, 0, 1 + i), ...over,
});
const samples = (minutes: number[]) => minutes.map((m, i) => sample(m, {}, i));

describe('computePaceByKind', () => {
  it('needs five usable lessons of a kind', () => {
    expect(computePaceByKind(samples([12, 10, 15, 11]))).toEqual({});
    expect(computePaceByKind(samples([12, 10, 15, 11, 14])).concept.count).toBe(5);
  });

  it('turns recent lessons into a personal range', () => {
    const pace = computePaceByKind(samples([12, 10, 15, 11, 14])).concept;
    expect(personalRange(30, pace)).toEqual({ low: 10, high: 15 });
    expect(personalRange(60, pace)).toEqual({ low: 20, high: 30 });
  });

  it('ignores lessons opened and immediately finished', () => {
    expect(computePaceByKind([...samples([12, 10, 15, 11]), sample(1, {}, 9)])).toEqual({});
  });

  it('ignores readings too far from the estimate to be real', () => {
    expect(computePaceByKind([...samples([12, 10, 15, 11]), sample(600, {}, 9)])).toEqual({});
  });

  it('keeps lesson kinds apart', () => {
    const mixed = [...samples([12, 10, 15, 11]), sample(40, { kind: 'project' }, 9)];
    expect(computePaceByKind(mixed)).toEqual({});
  });

  it('follows your most recent ten lessons', () => {
    const old = Array.from({ length: 10 }, (_, i) => sample(60, {}, i));
    const recent = Array.from({ length: 10 }, (_, i) => sample(15, {}, 20 + i));
    const pace = computePaceByKind([...old, ...recent]).concept;
    expect(pace.high).toBeCloseTo(0.5);
    expect(pace.count).toBe(20);
  });
});

describe('labels', () => {
  const pace = { low: 0.37, high: 0.47, count: 5 };

  it('marks a guess as an estimate', () => {
    expect(lessonTimeLabel(30, undefined)).toBe('Est. 30 min');
    expect(lessonTimeLabel(90, undefined, { short: true })).toBe('est. 1h 30m');
  });

  it('shows your range once measured', () => {
    expect(lessonTimeLabel(30, pace)).toBe('Usually 10–15 min for you');
    expect(lessonTimeLabel(30, pace, { short: true })).toBe('usually 10–15 min');
  });

  it('never shows a collapsed range', () => {
    expect(personalRange(10, { low: 0.5, high: 0.52, count: 5 })).toEqual({ low: 5, high: 10 });
  });

  it('compares actual time with the estimate', () => {
    expect(tookLabel(720, 30)).toBe('Took 12 min · estimate was 30 min');
  });

  it('says nothing about a lesson with no real time recorded', () => {
    expect(tookLabel(undefined, 30)).toBeNull();
    expect(tookLabel(20, 30)).toBeNull();
  });
});

describe('review card time', () => {
  it('waits for ten timed cards', () => {
    expect(typicalCardSeconds(Array(9).fill(20_000))).toBeNull();
    expect(typicalCardSeconds(Array(10).fill(20_000))).toBe(20);
  });

  it('uses the typical card, so one slow card does not skew it', () => {
    expect(typicalCardSeconds([...Array(10).fill(20_000), 500_000])).toBe(20);
  });

  it('uses your real average and keeps the default until then', () => {
    expect(reviewMinutes(6, 20)).toBe(2);
    expect(reviewMinutes(10, null)).toBe(7);
    expect(reviewMinutes(0, null)).toBe(1);
  });
});

describe('secondsByModule', () => {
  it('counts time up to the moment a lesson was finished', () => {
    const items = [{ topicId: 't', legacyId: 'm', completedAt: new Date('2026-01-02') }];
    const entries = [
      { topicId: 't', moduleId: 'm', seconds: 100, startedAt: new Date('2026-01-01') },
      { topicId: 't', moduleId: 'm', seconds: 900, startedAt: new Date('2026-01-03') },
      { topicId: 'other', moduleId: 'm', seconds: 50, startedAt: new Date('2026-01-01') },
    ];
    expect(secondsByModule(items, entries).get('t|m')).toBe(100);
  });
});
