import { describe, it, expect } from 'vitest';
import { RUBRIC_TEMPLATES, getRubricTemplate, isValidRubricKey, validateRubricScores, DEFAULT_RUBRIC_KEY } from './practiceRubrics';

describe('practice rubric templates', () => {
  it('every template has unique keys and unique dimension keys', () => {
    expect(new Set(RUBRIC_TEMPLATES.map((t) => t.key)).size).toBe(RUBRIC_TEMPLATES.length);
    for (const t of RUBRIC_TEMPLATES) {
      expect(new Set(t.dimensions.map((d) => d.key)).size, t.key).toBe(t.dimensions.length);
      expect(t.dimensions.length, t.key).toBeGreaterThan(0);
    }
  });

  it('falls back to the default template for unknown or missing keys', () => {
    expect(getRubricTemplate(null).key).toBe(DEFAULT_RUBRIC_KEY);
    expect(getRubricTemplate('nope').key).toBe(DEFAULT_RUBRIC_KEY);
    expect(getRubricTemplate('writing').key).toBe('writing');
  });

  it('keeps the original four spoken-English dimensions, so existing reps still match', () => {
    const t = getRubricTemplate('spoken_english');
    expect(t.dimensions.map((d) => d.key)).toEqual(['fluency', 'structure', 'vocabulary', 'fillers']);
    expect(t.dimensions.find((d) => d.key === 'fillers')?.inverted).toBe(true);
  });

  it('validates keys', () => {
    expect(isValidRubricKey('impromptu')).toBe(true);
    expect(isValidRubricKey('made_up')).toBe(false);
    expect(isValidRubricKey(3)).toBe(false);
  });

  describe('validateRubricScores', () => {
    const t = getRubricTemplate('writing');
    const ok = { clarity: 3, concision: 4, structure: 2, errors: 1 };

    it('accepts a complete integer 1..5 score set', () => {
      expect(validateRubricScores(t, ok)).toBeNull();
    });
    it('rejects missing or extra dimensions', () => {
      expect(validateRubricScores(t, { clarity: 3 })).toMatch(/exactly/);
      expect(validateRubricScores(t, { ...ok, fluency: 3 })).toMatch(/exactly/);
    });
    it('rejects out-of-range or non-integer scores', () => {
      expect(validateRubricScores(t, { ...ok, clarity: 6 })).toMatch(/1 to 5/);
      expect(validateRubricScores(t, { ...ok, clarity: 2.5 })).toMatch(/1 to 5/);
      expect(validateRubricScores(t, { ...ok, clarity: '3' })).toMatch(/1 to 5/);
    });
    it('rejects non-objects', () => {
      expect(validateRubricScores(t, null)).toMatch(/object/);
    });
  });
});
