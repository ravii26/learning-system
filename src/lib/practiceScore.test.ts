import { describe, it, expect } from 'vitest';
import { computeRepScore } from './practiceScore';

describe('computeRepScore', () => {
  it('returns 0 for an empty rubric', () => {
    expect(computeRepScore({ scores: {} })).toBe(0);
  });

  it('maps a single dimension from 1..5 onto 0..1', () => {
    expect(computeRepScore({ scores: { fluency: 1 } })).toBe(0);
    expect(computeRepScore({ scores: { fluency: 5 } })).toBe(1);
    expect(computeRepScore({ scores: { fluency: 3 } })).toBe(0.5);
  });

  it('averages multiple dimensions', () => {
    // fluency=5 (1.0) + structure=1 (0.0) -> 0.5
    expect(computeRepScore({ scores: { fluency: 5, structure: 1 } })).toBe(0.5);
  });

  it('inverts a dimension named in invertedKeys before normalizing', () => {
    // fillers=1 (few fillers, good) inverted -> raw 5 -> normalized 1.0
    expect(computeRepScore({ scores: { fillers: 1 }, invertedKeys: ['fillers'] })).toBe(1);
    // fillers=5 (many fillers, bad) inverted -> raw 1 -> normalized 0.0
    expect(computeRepScore({ scores: { fillers: 5 }, invertedKeys: ['fillers'] })).toBe(0);
  });

  it('mixes inverted and non-inverted dimensions correctly', () => {
    // structure=5 (1.0, not inverted) + fillers=5 (0.0, inverted) -> 0.5
    const score = computeRepScore({ scores: { structure: 5, fillers: 5 }, invertedKeys: ['fillers'] });
    expect(score).toBe(0.5);
  });

  it('clamps raw values outside 1..5', () => {
    expect(computeRepScore({ scores: { fluency: 0 } })).toBe(0);
    expect(computeRepScore({ scores: { fluency: 9 } })).toBe(1);
  });

  it('a dimension not listed in invertedKeys is treated as higher-is-better', () => {
    expect(computeRepScore({ scores: { vocabulary: 4 }, invertedKeys: ['fillers'] })).toBe(0.75);
  });
});
