import { describe, it, expect } from 'vitest';
import { sessionLogRowToJson, sessionLogJsonToRowData, type SessionLogRowLike } from './sessionLogSync';

describe('sessionLogSync mapping', () => {
  it('round-trips through jsonToRowData -> rowToJson', () => {
    const original = {
      id: 'sl1',
      activityType: 'write_practice',
      whatDone: 'Solved 3 problems',
      oneInsight: 'Two pointers converge',
      whatWasHard: 'Off-by-one errors',
      nextAction: 'Try sliding window next',
      durationMinutes: 25,
      moduleId: 'mod1',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const rowData = sessionLogJsonToRowData(original);
    const asRow: SessionLogRowLike = { id: 'row-uuid', ...rowData };
    const back = sessionLogRowToJson(asRow);

    expect(back.id).toBe(original.id);
    expect(back.activityType).toBe(original.activityType);
    expect(back.whatDone).toBe(original.whatDone);
    expect(back.durationMinutes).toBe(original.durationMinutes);
    expect(back.moduleId).toBe(original.moduleId);
    expect(back.timestamp).toBe(original.timestamp);
  });

  it('falls back to the row id when there is no legacyId', () => {
    const row: SessionLogRowLike = {
      id: 'row-uuid', legacyId: null, activityType: 'read_watch', whatDone: '', oneInsight: '',
      whatWasHard: '', nextAction: '', durationMinutes: 0, moduleId: null, timestamp: new Date('2026-01-01'),
    };
    expect(sessionLogRowToJson(row).id).toBe('row-uuid');
  });

  it('defaults missing durationMinutes to 0 rather than NaN', () => {
    expect(sessionLogJsonToRowData({ id: 'x', activityType: 'read_watch', whatDone: '', oneInsight: '', whatWasHard: '', nextAction: '', durationMinutes: NaN as any, timestamp: '' }).durationMinutes).toBe(0);
  });

  it('defaults missing activityType to free_explore', () => {
    expect(sessionLogJsonToRowData({ id: 'x', activityType: '', whatDone: '', oneInsight: '', whatWasHard: '', nextAction: '', durationMinutes: 5, timestamp: '' }).activityType).toBe('free_explore');
  });
});
