import { describe, expect, it } from 'vitest';
import { normalizeRealLife } from './tryInRealLife';
import { normalizeLesson } from './lessonNormalize';

describe('normalizeRealLife', () => {
  it('keeps good items and trims them', () => {
    const out = normalizeRealLife([{ type: 'habit', task: ' Save first ', how: 'Move ₹500 on salary day', when: '30 days', check: 'Balance grows' }]);
    expect(out).toEqual([{ type: 'habit', task: 'Save first', how: 'Move ₹500 on salary day', when: '30 days', check: 'Balance grows' }]);
  });
  it('drops items with no task or steps, and unknown types become practice', () => {
    const out = normalizeRealLife([{ type: 'habit', task: 'x' }, { type: 'nonsense', task: 'a', how: 'b' }, 'str', null]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('practice');
  });
  it('keeps at most three and tolerates a non-array', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ type: 'observe', task: `t${i}`, how: 'h' }));
    expect(normalizeRealLife(many)).toHaveLength(3);
    expect(normalizeRealLife('nope')).toEqual([]);
  });
  it('is part of a normalised lesson, empty when absent', () => {
    const base = { summary: 's', explanation: 'e' };
    expect(normalizeLesson(base)!.tryInRealLife).toEqual([]);
    expect(normalizeLesson({ ...base, tryInRealLife: [{ type: 'reflect', task: 'a', how: 'b' }] })!.tryInRealLife).toHaveLength(1);
  });
});
