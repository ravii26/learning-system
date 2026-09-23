import { describe, it, expect } from 'vitest';
import { computePracticeTrend } from './practiceTrend';

const NOW = new Date('2026-09-23T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('computePracticeTrend', () => {
  it('reports New with no reps', () => {
    const result = computePracticeTrend([], NOW);
    expect(result).toEqual({ repCount: 0, spanDays: 0, currentStreak: 0, dimensions: [], overallTrend: 'New', weakestKey: null });
  });

  it('reports New with fewer than 3 reps even if a dimension technically improved', () => {
    const reps = [
      { occurredAt: day(2), rubricScores: { fluency: 2 } },
      { occurredAt: day(0), rubricScores: { fluency: 5 } },
    ];
    expect(computePracticeTrend(reps, NOW).overallTrend).toBe('New');
  });

  it('detects an improving non-inverted dimension', () => {
    const reps = [
      { occurredAt: day(6), rubricScores: { structure: 2 } },
      { occurredAt: day(4), rubricScores: { structure: 2 } },
      { occurredAt: day(2), rubricScores: { structure: 4 } },
      { occurredAt: day(0), rubricScores: { structure: 5 } },
    ];
    const result = computePracticeTrend(reps, NOW);
    const structure = result.dimensions.find((d) => d.key === 'structure')!;
    // 4 values, bucket size = min(3, floor(4/2)) = 2 -> first 2 vs last 2, no overlap
    expect(structure.first).toBeCloseTo(2, 5);
    expect(structure.last).toBeCloseTo(4.5, 5);
    expect(structure.improving).toBe(true);
    expect(result.overallTrend).toBe('Improving');
  });

  it('detects an improving inverted dimension (lower raw score = improving)', () => {
    const reps = [
      { occurredAt: day(6), rubricScores: { fillers: 5 }, invertedKeys: ['fillers'] },
      { occurredAt: day(4), rubricScores: { fillers: 4 }, invertedKeys: ['fillers'] },
      { occurredAt: day(2), rubricScores: { fillers: 2 }, invertedKeys: ['fillers'] },
      { occurredAt: day(0), rubricScores: { fillers: 1 }, invertedKeys: ['fillers'] },
    ];
    const result = computePracticeTrend(reps, NOW);
    const fillers = result.dimensions.find((d) => d.key === 'fillers')!;
    expect(fillers.inverted).toBe(true);
    expect(fillers.improving).toBe(true);
    expect(result.overallTrend).toBe('Improving');
  });

  it('reports Steady when change is within the noise threshold', () => {
    const reps = [
      { occurredAt: day(4), rubricScores: { fluency: 3 } },
      { occurredAt: day(2), rubricScores: { fluency: 3 } },
      { occurredAt: day(0), rubricScores: { fluency: 3.1 } },
    ];
    expect(computePracticeTrend(reps, NOW).overallTrend).toBe('Steady');
  });

  it('reports Needs focus when a dimension is regressing', () => {
    const reps = [
      { occurredAt: day(4), rubricScores: { fluency: 4 } },
      { occurredAt: day(2), rubricScores: { fluency: 3 } },
      { occurredAt: day(0), rubricScores: { fluency: 2 } },
    ];
    expect(computePracticeTrend(reps, NOW).overallTrend).toBe('Needs focus');
  });

  it('identifies the weakest dimension by its most recent normalized value', () => {
    const reps = [
      { occurredAt: day(2), rubricScores: { structure: 4, vocabulary: 2 } },
      { occurredAt: day(0), rubricScores: { structure: 4, vocabulary: 2 } },
    ];
    expect(computePracticeTrend(reps, NOW).weakestKey).toBe('vocabulary');
  });

  it('correctly normalizes an inverted dimension when picking the weakest', () => {
    // fillers=5 raw (bad) inverted -> normalized-low; vocabulary=4 raw (fine) -> normalized-high
    const reps = [{ occurredAt: day(0), rubricScores: { fillers: 5, vocabulary: 4 }, invertedKeys: ['fillers'] }];
    expect(computePracticeTrend(reps, NOW).weakestKey).toBe('fillers');
  });

  it('computes a full current streak when reps land on consecutive days including today', () => {
    const reps = [
      { occurredAt: day(2), rubricScores: { fluency: 3 } },
      { occurredAt: day(1), rubricScores: { fluency: 3 } },
      { occurredAt: day(0), rubricScores: { fluency: 3 } },
    ];
    expect(computePracticeTrend(reps, NOW).currentStreak).toBe(3);
  });

  it('breaks the streak count on a gap', () => {
    const reps = [
      { occurredAt: day(10), rubricScores: { fluency: 3 } },
      { occurredAt: day(1), rubricScores: { fluency: 3 } },
      { occurredAt: day(0), rubricScores: { fluency: 3 } },
    ];
    expect(computePracticeTrend(reps, NOW).currentStreak).toBe(2);
  });

  it('reports a zero streak when the most recent rep is more than a day old', () => {
    const reps = [
      { occurredAt: day(5), rubricScores: { fluency: 3 } },
      { occurredAt: day(4), rubricScores: { fluency: 3 } },
    ];
    expect(computePracticeTrend(reps, NOW).currentStreak).toBe(0);
  });

  it('counts multiple reps on the same day as one streak day', () => {
    const reps = [
      { occurredAt: day(0), rubricScores: { fluency: 3 } },
      { occurredAt: new Date(day(0).getTime() + 60 * 60 * 1000), rubricScores: { fluency: 4 } },
    ];
    expect(computePracticeTrend(reps, NOW).currentStreak).toBe(1);
    expect(computePracticeTrend(reps, NOW).repCount).toBe(2);
  });

  it('computes spanDays across the full history', () => {
    const reps = [
      { occurredAt: day(10), rubricScores: { fluency: 3 } },
      { occurredAt: day(0), rubricScores: { fluency: 3 } },
    ];
    expect(computePracticeTrend(reps, NOW).spanDays).toBe(10);
  });
});
