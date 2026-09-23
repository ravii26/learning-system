import { describe, it, expect } from 'vitest';
import { MASTERY_LADDER, MASTERY_ENUM_VALUES, labelToEnum, enumToLabel, ladderIndex } from './masteryLevel';

describe('masteryLevel mapping', () => {
  it('ladder and enum arrays are the same length and order', () => {
    expect(MASTERY_ENUM_VALUES.length).toBe(MASTERY_LADDER.length);
  });

  it('every ladder label round-trips through the enum and back', () => {
    for (const label of MASTERY_LADDER) {
      expect(enumToLabel(labelToEnum(label))).toBe(label);
    }
  });

  it('every enum value round-trips through the label and back', () => {
    for (const value of MASTERY_ENUM_VALUES) {
      expect(labelToEnum(enumToLabel(value))).toBe(value);
    }
  });

  it('maps the two ends of the ladder correctly by name', () => {
    expect(labelToEnum('Unknown')).toBe('Unknown');
    expect(labelToEnum('Can Create')).toBe('CanCreate');
    expect(enumToLabel('Unknown')).toBe('Unknown');
    expect(enumToLabel('CanCreate')).toBe('Can Create');
  });

  it('falls back to Unknown for garbage input', () => {
    expect(labelToEnum('nonsense')).toBe('Unknown');
    expect(labelToEnum(null)).toBe('Unknown');
    expect(labelToEnum(undefined)).toBe('Unknown');
    expect(labelToEnum('')).toBe('Unknown');
    expect(enumToLabel('nonsense')).toBe('Unknown');
  });

  it('ladderIndex finds the right position', () => {
    expect(ladderIndex('Unknown')).toBe(0);
    expect(ladderIndex('Can Explain')).toBe(6);
    expect(ladderIndex('Can Create')).toBe(8);
    expect(ladderIndex('nonsense')).toBe(-1);
  });
});
