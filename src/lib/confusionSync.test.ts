import { describe, it, expect } from 'vitest';
import { confusionRowToJson, confusionJsonToRowData, type ConfusionRowLike } from './confusionSync';

describe('confusionSync mapping', () => {
  it('round-trips an unresolved confusion', () => {
    const original = { id: 'c1', text: 'Why does the window shrink first?', resolved: false, resolvedAt: null, answer: null };
    const rowData = confusionJsonToRowData(original);
    const asRow: ConfusionRowLike = { id: 'row-uuid', ...rowData };
    const back = confusionRowToJson(asRow);

    expect(back.id).toBe(original.id);
    expect(back.text).toBe(original.text);
    expect(back.resolved).toBe(false);
    expect(back.answer).toBeNull();
  });

  it('round-trips a resolved confusion with an answer', () => {
    const original = { id: 'c2', text: 'X', resolved: true, resolvedAt: '2026-01-02T00:00:00.000Z', answer: 'Because Y' };
    const rowData = confusionJsonToRowData(original);
    const asRow: ConfusionRowLike = { id: 'row-uuid', ...rowData };
    const back = confusionRowToJson(asRow);

    expect(back.resolved).toBe(true);
    expect(back.resolvedAt).toBe('2026-01-02T00:00:00.000Z');
    expect(back.answer).toBe('Because Y');
  });

  it('coerces a missing resolved flag to false, not undefined', () => {
    expect(confusionJsonToRowData({ id: 'x', text: 'T', resolved: undefined as any }).resolved).toBe(false);
  });
});
