import { describe, it, expect } from 'vitest';
import { mistakeRowToJson, mistakeJsonToRowData, type MistakeRowLike } from './mistakeSync';

describe('mistakeSync mapping', () => {
  it('round-trips a full mistake record', () => {
    const original = {
      id: 'm1',
      concept: 'CAP Theorem',
      mistake: 'Assumed CP and AP simultaneously achievable',
      whyMade: 'Confused availability with uptime',
      correctUnderstanding: 'Must choose during a partition',
      example: 'Split-brain scenario',
      howToAvoid: 'Draw the partition explicitly',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const rowData = mistakeJsonToRowData(original);
    const asRow: MistakeRowLike = { id: 'row-uuid', ...rowData };
    const back = mistakeRowToJson(asRow);

    expect(back.id).toBe(original.id);
    expect(back.concept).toBe(original.concept);
    expect(back.mistake).toBe(original.mistake);
    expect(back.whyMade).toBe(original.whyMade);
    expect(back.createdAt).toBe(original.createdAt);
  });

  it('defaults a blank concept label to General', () => {
    expect(mistakeJsonToRowData({ id: 'x', concept: '', mistake: 'M', createdAt: '' }).conceptLabel).toBe('General');
  });

  it('nulls out optional fields rather than leaving them undefined', () => {
    const data = mistakeJsonToRowData({ id: 'x', concept: 'C', mistake: 'M', createdAt: '' });
    expect(data.whyMade).toBeNull();
    expect(data.correctUnderstanding).toBeNull();
    expect(data.example).toBeNull();
    expect(data.howToAvoid).toBeNull();
  });
});
