import { describe, it, expect } from 'vitest';
import { conceptRowToJson, legacyConceptToRowData, type ConceptRowLike } from './conceptSync';

describe('legacyConceptToRowData', () => {
  it('maps title/status/difficulty/importance and seeds FSRS state', () => {
    const data = legacyConceptToRowData({
      id: 'abc123',
      title: 'CAP Theorem',
      status: 'Can Recall',
      difficulty: 'High',
      importance: 'High',
      reviewIntervalDays: 14,
      consecutiveRecalls: 3,
    });

    expect(data.title).toBe('CAP Theorem');
    expect(data.masteryLevel).toBe('CanRecall');
    expect(data.difficultyTag).toBe('High');
    expect(data.importance).toBe('High');
    expect(data.legacyId).toBe('abc123');
  });

  it('falls back to a placeholder title when blank', () => {
    expect(legacyConceptToRowData({ id: 'x', title: '   ' }).title).toBe('Untitled concept');
    expect(legacyConceptToRowData({ id: 'x', title: '' }).title).toBe('Untitled concept');
  });

  it('defaults an unset status to Unknown', () => {
    expect(legacyConceptToRowData({ id: 'x', title: 'New one' }).masteryLevel).toBe('Unknown');
  });

  it('nulls out difficulty/importance rather than empty strings', () => {
    const data = legacyConceptToRowData({ id: 'x', title: 'T' });
    expect(data.difficultyTag).toBeNull();
    expect(data.importance).toBeNull();
  });
});

describe('conceptRowToJson', () => {
  const baseRow: ConceptRowLike = {
    id: 'row-uuid-1',
    legacyId: 'legacy-abc',
    title: 'Sliding Window',
    parentId: null,
    masteryLevel: 'CanApply',
    difficultyTag: 'Medium',
    importance: 'High',
  };

  it('prefers legacyId as the JSON id, for continuity with the old shape', () => {
    const json = conceptRowToJson(baseRow, new Map());
    expect(json.id).toBe('legacy-abc');
  });

  it('falls back to the row id when there is no legacyId (a row created after this migration)', () => {
    const json = conceptRowToJson({ ...baseRow, legacyId: null }, new Map());
    expect(json.id).toBe('row-uuid-1');
  });

  it('maps masteryLevel back to the space-separated display label', () => {
    expect(conceptRowToJson(baseRow, new Map()).status).toBe('Can Apply');
  });

  it('resolves parentId through the row-id -> legacyId map', () => {
    const map = new Map([['parent-row-uuid', 'parent-legacy-id']]);
    const json = conceptRowToJson({ ...baseRow, parentId: 'parent-row-uuid' }, map);
    expect(json.parentId).toBe('parent-legacy-id');
  });

  it('parentId is null when there is no parent', () => {
    expect(conceptRowToJson(baseRow, new Map()).parentId).toBeNull();
  });

  it('defaults difficulty/importance to Medium for display when unset', () => {
    const json = conceptRowToJson({ ...baseRow, difficultyTag: null, importance: null }, new Map());
    expect(json.difficulty).toBe('Medium');
    expect(json.importance).toBe('Medium');
  });

  it('round-trips through legacyConceptToRowData -> conceptRowToJson for the fields both share', () => {
    const original = { id: 'rt-1', title: 'Round Trip', status: 'Understood', difficulty: 'Low', importance: 'Low' };
    const rowData = legacyConceptToRowData(original);
    const asRow: ConceptRowLike = {
      id: 'whatever-uuid',
      legacyId: rowData.legacyId,
      title: rowData.title,
      parentId: null,
      masteryLevel: rowData.masteryLevel,
      difficultyTag: rowData.difficultyTag,
      importance: rowData.importance,
    };
    const backToJson = conceptRowToJson(asRow, new Map());

    expect(backToJson.id).toBe(original.id);
    expect(backToJson.title).toBe(original.title);
    expect(backToJson.status).toBe(original.status);
    expect(backToJson.difficulty).toBe(original.difficulty);
    expect(backToJson.importance).toBe(original.importance);
  });
});
