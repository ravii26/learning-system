import { describe, it, expect } from 'vitest';
import { calculateTopicProgress, calculateTopicProgressForMode } from './progressCalculator';

/**
 * Regression net for the weighted progress model.
 *
 * NOTE: this function is currently dead code — nothing imports it. The app
 * computes progressPct from subtasks alone in topics/[id]/page.tsx. These tests
 * pin the intended behaviour so Phase 5 can wire it up without guessing.
 *
 * Weights: subtasks 0.30, curriculum 0.35, concepts 0.35, renormalised over
 * whichever factors are actually present.
 */
describe('calculateTopicProgress', () => {
  describe('with no structured data', () => {
    it('returns 0 for an empty topic', () => {
      expect(calculateTopicProgress({})).toBe(0);
    });

    it('returns 0 when every collection is empty', () => {
      expect(
        calculateTopicProgress({ subtasks: [], curriculum: [], knowledgeMap: { concepts: [] } })
      ).toBe(0);
    });

    it('falls back to manualOverridePct', () => {
      expect(calculateTopicProgress({ manualOverridePct: 42 })).toBe(42);
    });

    it('clamps the manual override into 0..100', () => {
      expect(calculateTopicProgress({ manualOverridePct: 150 })).toBe(100);
      expect(calculateTopicProgress({ manualOverridePct: -5 })).toBe(0);
    });

    it('treats a null override as absent', () => {
      expect(calculateTopicProgress({ manualOverridePct: null })).toBe(0);
    });
  });

  describe('with a single factor present', () => {
    it('reports the subtask percentage directly (weight renormalises to 1)', () => {
      expect(
        calculateTopicProgress({
          subtasks: [{ completed: true }, { completed: true }, { completed: false }, { completed: false }],
        })
      ).toBe(50);
    });

    it('reports the curriculum percentage directly', () => {
      expect(
        calculateTopicProgress({ curriculum: [{ completed: true }, { completed: false }] })
      ).toBe(50);
    });

    it('ignores a manual override once real structure exists', () => {
      expect(
        calculateTopicProgress({
          subtasks: [{ completed: true }, { completed: true }],
          manualOverridePct: 3,
        })
      ).toBe(100);
    });
  });

  describe('concept mastery', () => {
    it('counts anything above Exposed as mastered', () => {
      expect(
        calculateTopicProgress({
          knowledgeMap: {
            concepts: [
              { status: 'Unknown' },
              { status: 'Exposed' },
              { status: 'Understood' },
              { status: 'Can Teach' },
            ],
          },
        })
      ).toBe(50);
    });

    it('does not count Unknown or Exposed', () => {
      expect(
        calculateTopicProgress({
          knowledgeMap: { concepts: [{ status: 'Unknown' }, { status: 'Exposed' }] },
        })
      ).toBe(0);
    });

    it('treats a missing status as not mastered', () => {
      expect(calculateTopicProgress({ knowledgeMap: { concepts: [{}, { status: 'Understood' }] } })).toBe(50);
    });
  });

  describe('weighted combination', () => {
    it('averages equal percentages to that percentage', () => {
      expect(
        calculateTopicProgress({
          subtasks: [{ completed: true }, { completed: false }],
          curriculum: [{ completed: true }, { completed: false }],
          knowledgeMap: { concepts: [{ status: 'Understood' }, { status: 'Unknown' }] },
        })
      ).toBe(50);
    });

    it('weights concepts (0.35) above subtasks (0.30)', () => {
      // subtasks 100% @ .30, concepts 0% @ .35 -> 30 / 0.65 = 46.15 -> 46
      expect(
        calculateTopicProgress({
          subtasks: [{ completed: true }],
          knowledgeMap: { concepts: [{ status: 'Unknown' }] },
        })
      ).toBe(46);
    });

    it('caps at 100 when everything is complete', () => {
      expect(
        calculateTopicProgress({
          subtasks: [{ completed: true }],
          curriculum: [{ completed: true }],
          knowledgeMap: { concepts: [{ status: 'Can Teach' }] },
        })
      ).toBe(100);
    });

    it('is 0 when nothing is complete', () => {
      expect(
        calculateTopicProgress({
          subtasks: [{ completed: false }],
          curriculum: [{ completed: false }],
          knowledgeMap: { concepts: [{ status: 'Unknown' }] },
        })
      ).toBe(0);
    });
  });

  describe('invariants', () => {
    it('never leaves the 0..100 range across a spread of shapes', () => {
      const shapes = [
        { subtasks: Array(37).fill({ completed: true }) },
        { curriculum: Array(13).fill({ completed: false }) },
        { knowledgeMap: { concepts: Array(101).fill({ status: 'Can Apply' }) } },
        {
          subtasks: [{ completed: true }, { completed: false }],
          curriculum: Array(7).fill({ completed: true }),
          knowledgeMap: { concepts: [{ status: 'Exposed' }] },
        },
      ];

      for (const shape of shapes) {
        const result = calculateTopicProgress(shape);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
        expect(Number.isInteger(result)).toBe(true);
      }
    });
  });

  describe('calculateTopicProgressForMode', () => {
    const data = { subtasks: [{ completed: true }, { completed: false }] };

    it('every known mode currently agrees with the base calculation (no mode has its own data source yet)', () => {
      const base = calculateTopicProgress(data);
      for (const mode of ['syllabus', 'practice', 'accretion', 'reference']) {
        expect(calculateTopicProgressForMode(mode, data)).toBe(base);
      }
    });

    it('falls back to the base calculation for an unrecognized mode rather than throwing', () => {
      expect(() => calculateTopicProgressForMode('something_future', data)).not.toThrow();
      expect(calculateTopicProgressForMode('something_future', data)).toBe(calculateTopicProgress(data));
    });
  });
});
