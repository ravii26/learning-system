import { describe, it, expect } from 'vitest';
import { computeSkillMastery, scoreToLevel } from './mastery';

describe('computeSkillMastery', () => {
  describe('no evidence', () => {
    it('scores 0 with Unknown level when there are no concepts or reviews', () => {
      const r = computeSkillMastery([], []);
      expect(r.score).toBe(0);
      expect(r.level).toBe('Unknown');
      expect(r.evidenceCount).toBe(0);
    });
  });

  describe('coverage only (no review history yet)', () => {
    it('is 1.0 coverage when every concept clears Exposed', () => {
      const r = computeSkillMastery(
        [{ masteryLevel: 'CanRecall' }, { masteryLevel: 'Understood' }],
        []
      );
      expect(r.breakdown.coverage).toBe(1);
      expect(r.breakdown.retention).toBe(0);
      expect(r.score).toBeCloseTo(1, 5); // only coverage has weight when there's no review evidence
    });

    it('does not count Unknown or Exposed as covered', () => {
      const r = computeSkillMastery([{ masteryLevel: 'Unknown' }, { masteryLevel: 'Exposed' }], []);
      expect(r.breakdown.coverage).toBe(0);
    });

    it('is 0.5 coverage with a 50/50 split', () => {
      const r = computeSkillMastery([{ masteryLevel: 'Unknown' }, { masteryLevel: 'CanApply' }], []);
      expect(r.breakdown.coverage).toBe(0.5);
    });
  });

  describe('retention only (concepts exist elsewhere, no coverage signal here)', () => {
    it('is 1.0 retention when no review was a lapse', () => {
      const r = computeSkillMastery([], [{ grade: 'Good' }, { grade: 'Easy' }, { grade: 'Hard' }]);
      expect(r.breakdown.retention).toBe(1);
    });

    it('counts only Again as a lapse', () => {
      const r = computeSkillMastery([], [{ grade: 'Again' }, { grade: 'Good' }, { grade: 'Hard' }, { grade: 'Easy' }]);
      expect(r.breakdown.retention).toBeCloseTo(0.75, 5);
    });
  });

  describe('blended', () => {
    it('averages coverage and retention equally when both have evidence', () => {
      const r = computeSkillMastery(
        [{ masteryLevel: 'CanApply' }, { masteryLevel: 'Unknown' }], // coverage 0.5
        [{ grade: 'Good' }, { grade: 'Again' }] // retention 0.5
      );
      expect(r.score).toBeCloseTo(0.5, 5);
    });

    it('a skill with full coverage but poor retention scores in between', () => {
      const fullCoverageOnly = computeSkillMastery([{ masteryLevel: 'CanTeach' }], []);
      const blended = computeSkillMastery([{ masteryLevel: 'CanTeach' }], [{ grade: 'Again' }, { grade: 'Again' }]);
      expect(blended.score).toBeLessThan(fullCoverageOnly.score);
    });
  });

  describe('practice and artifacts (Phase 9)', () => {
    it('is 0 practice/artifacts with no rows, matching pre-Phase-9 callers', () => {
      const r = computeSkillMastery([{ masteryLevel: 'CanApply' }], []);
      expect(r.breakdown.practice).toBe(0);
      expect(r.breakdown.artifacts).toBe(0);
    });

    it('averages PracticeRep scores for the practice component', () => {
      const r = computeSkillMastery([], [], [{ score: 0.8 }, { score: 0.4 }]);
      expect(r.breakdown.practice).toBeCloseTo(0.6, 5);
    });

    it('saturates artifacts at 1.0 once the count reaches the target', () => {
      const twoArtifacts = computeSkillMastery([], [], [], [{}, {}]);
      const fiveArtifacts = computeSkillMastery([], [], [], [{}, {}, {}, {}, {}]);
      const tenArtifacts = computeSkillMastery([], [], [], Array(10).fill({}));
      expect(twoArtifacts.breakdown.artifacts).toBeCloseTo(0.4, 5);
      expect(fiveArtifacts.breakdown.artifacts).toBe(1);
      expect(tenArtifacts.breakdown.artifacts).toBe(1);
    });

    it('excludes an evidence-free source from the score instead of scoring it 0', () => {
      // Full coverage, no reviews/reps/artifacts at all — score must equal
      // coverage exactly, not be dragged down by three absent dimensions.
      const r = computeSkillMastery([{ masteryLevel: 'CanTeach' }], []);
      expect(r.score).toBeCloseTo(1, 5);
    });

    it('blends all four sources when every one has evidence', () => {
      const r = computeSkillMastery(
        [{ masteryLevel: 'CanApply' }], // coverage 1.0
        [{ grade: 'Again' }], // retention 0
        [{ score: 1 }], // practice 1.0
        [] // artifacts 0 (excluded — no rows)
      );
      // Only coverage, retention, practice have evidence -> equal thirds
      expect(r.score).toBeCloseTo((1 + 0 + 1) / 3, 5);
    });

    it('sums all four sources into evidenceCount', () => {
      const r = computeSkillMastery(
        [{ masteryLevel: 'Understood' }],
        [{ grade: 'Good' }, { grade: 'Hard' }],
        [{ score: 0.5 }],
        [{}, {}]
      );
      expect(r.evidenceCount).toBe(6);
    });
  });

  describe('evidenceCount', () => {
    it('sums concepts and review logs', () => {
      const r = computeSkillMastery(
        [{ masteryLevel: 'Understood' }, { masteryLevel: 'Unknown' }],
        [{ grade: 'Good' }, { grade: 'Hard' }, { grade: 'Again' }]
      );
      expect(r.evidenceCount).toBe(5);
    });
  });

  describe('bounds', () => {
    it('score is always within [0, 1] across varied inputs', () => {
      const cases = [
        [[], []],
        [[{ masteryLevel: 'CanCreate' }], [{ grade: 'Easy' }]],
        [[{ masteryLevel: 'Unknown' }], [{ grade: 'Again' }]],
        [Array(50).fill({ masteryLevel: 'CanSolve' }), Array(100).fill({ grade: 'Good' })],
      ] as const;
      for (const [concepts, logs] of cases) {
        const r = computeSkillMastery([...concepts], [...logs]);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('scoreToLevel', () => {
  it('maps 0 to Unknown and 1 to CanCreate', () => {
    expect(scoreToLevel(0)).toBe('Unknown');
    expect(scoreToLevel(1)).toBe('CanCreate');
  });

  it('is monotonically non-decreasing as score rises', () => {
    const ladderOrder = ['Unknown', 'Exposed', 'Understood', 'CanRecall', 'CanApply', 'CanSolve', 'CanExplain', 'CanTeach', 'CanCreate'];
    let lastIdx = -1;
    for (let s = 0; s <= 1; s += 0.05) {
      const idx = ladderOrder.indexOf(scoreToLevel(s));
      expect(idx).toBeGreaterThanOrEqual(lastIdx);
      lastIdx = idx;
    }
  });

  it('clamps out-of-range input rather than throwing', () => {
    expect(() => scoreToLevel(-0.5)).not.toThrow();
    expect(scoreToLevel(-0.5)).toBe('Unknown');
    expect(scoreToLevel(1.5)).toBe('CanCreate');
  });
});
