import { describe, it, expect } from 'vitest';
import { planCurriculumSync, curriculumJsonToRowData, curriculumRowToJson, curriculumRowChanged } from './curriculumSync';

const mod = (id: string, extra: Record<string, unknown> = {}) => ({
  id, order: 1, title: `Module ${id}`, estimatedMinutes: 30, completed: false, completedAt: null, notes: '', ...extra,
});

describe('planCurriculumSync', () => {
  it('upserts every incoming module keyed by its id', () => {
    const plan = planCurriculumSync([], [mod('a'), mod('b')]);
    expect(plan.upserts.map((u) => u.legacyId)).toEqual(['a', 'b']);
    expect(plan.removeLegacyIds).toEqual([]);
  });

  it('soft-removes active rows missing from the incoming array', () => {
    const plan = planCurriculumSync(['a', 'b', 'c'], [mod('a'), mod('c')]);
    expect(plan.removeLegacyIds).toEqual(['b']);
  });

  it('keeps the first of duplicate ids', () => {
    const plan = planCurriculumSync([], [mod('a', { title: 'first' }), mod('a', { title: 'second' })]);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0].data.title).toBe('first');
  });

  it('assigns a fresh id to a module without one, so it can be referenced later', () => {
    const plan = planCurriculumSync([], [{ title: 'No id yet', order: 1 }]);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0].legacyId).toMatch(/^[a-z0-9]+$/);
  });

  it('an empty incoming array removes everything (the user deleted all modules)', () => {
    expect(planCurriculumSync(['a', 'b'], []).removeLegacyIds).toEqual(['a', 'b']);
  });

  it('skips junk entries rather than crashing', () => {
    const plan = planCurriculumSync([], [null as any, 'x' as any, mod('a')]);
    expect(plan.upserts.map((u) => u.legacyId)).toEqual(['a']);
  });
});

describe('curriculum mapping', () => {
  it('round-trips a completed module', () => {
    const json = mod('m1', { order: 3, completed: true, completedAt: '2026-09-01T10:00:00.000Z', notes: 'done', estimatedMinutes: 45 });
    const data = curriculumJsonToRowData(json, 99);
    const back = curriculumRowToJson({ id: 'row', legacyId: 'm1', ...data });
    expect(back).toEqual(json);
  });

  it('falls back to the array position for a missing order, and 30 minutes for bad durations', () => {
    const data = curriculumJsonToRowData({ title: 'x', estimatedMinutes: -5 as any }, 4);
    expect(data.order).toBe(4);
    expect(data.estimatedMinutes).toBe(30);
  });

  it('drops completedAt when the module is not completed', () => {
    expect(curriculumJsonToRowData({ title: 'x', completed: false, completedAt: '2026-01-01' }, 1).completedAt).toBeNull();
  });

  it('keeps a decision kind through the round trip, and leaves concept modules without one', () => {
    const decision = mod('d1', { kind: 'decision' });
    const data = curriculumJsonToRowData(decision, 1);
    expect(data.kind).toBe('decision');
    expect(curriculumRowToJson({ id: 'row', legacyId: 'd1', ...data })).toEqual(decision);
    expect(curriculumRowToJson({ id: 'row', legacyId: 'c1', ...curriculumJsonToRowData(mod('c1'), 1), kind: 'concept' })).not.toHaveProperty('kind');
  });

  it('keeps a blueprint in reading order and drops unknown sections', () => {
    const data = curriculumJsonToRowData(mod('d', { kind: 'decision', blueprint: ['decision_flow', 'banana', 'comparison_table'] }), 1);
    expect(data.blueprint).toEqual(['comparison_table', 'decision_flow']);
    expect(curriculumRowToJson({ id: 'r', legacyId: 'd', ...data }).blueprint).toEqual(['comparison_table', 'decision_flow']);
  });

  it('no blueprint sent leaves the stored one alone; an empty row blueprint is not shown', () => {
    expect(curriculumJsonToRowData(mod('a'), 1)).not.toHaveProperty('blueprint');
    expect(curriculumRowToJson({ id: 'r', legacyId: 'a', ...curriculumJsonToRowData(mod('a'), 1), blueprint: null })).not.toHaveProperty('blueprint');
    expect(curriculumRowToJson({ id: 'r', legacyId: 'a', ...curriculumJsonToRowData(mod('a'), 1), blueprint: [] })).not.toHaveProperty('blueprint');
  });

  it('a module with no (or an unknown) kind does not touch the stored kind', () => {
    expect(curriculumJsonToRowData(mod('a'), 1)).not.toHaveProperty('kind');
    expect(curriculumJsonToRowData(mod('a', { kind: 'banana' }), 1)).not.toHaveProperty('kind');
  });

  it('never stores an empty title', () => {
    expect(curriculumJsonToRowData({ title: '   ' }, 1).title).toBe('Untitled module');
  });
});

describe('curriculumRowChanged', () => {
  const row = { order: 1, title: 'Intro', estimatedMinutes: 30, completed: false, completedAt: null, kind: 'concept', blueprint: null };

  it('skips a row the syllabus sends back unchanged', () => {
    expect(curriculumRowChanged(row, curriculumJsonToRowData({ id: 'a', order: 1, title: 'Intro', estimatedMinutes: 30, completed: false, completedAt: null, notes: 'stale' }, 1))).toBe(false);
  });

  it('writes a module that was just ticked', () => {
    const data = curriculumJsonToRowData({ id: 'a', order: 1, title: 'Intro', estimatedMinutes: 30, completed: true, completedAt: '2026-11-15T10:00:00.000Z', notes: '' }, 1);
    expect(curriculumRowChanged(row, data)).toBe(true);
    expect(curriculumRowChanged({ ...row, completed: true, completedAt: new Date('2026-11-15T10:00:00.000Z') }, data)).toBe(false);
  });

  it('writes reorders, renames and kind changes', () => {
    const base = { id: 'a', order: 1, title: 'Intro', estimatedMinutes: 30, completed: false, completedAt: null, notes: '' };
    expect(curriculumRowChanged(row, curriculumJsonToRowData({ ...base, order: 2 }, 1))).toBe(true);
    expect(curriculumRowChanged(row, curriculumJsonToRowData({ ...base, title: 'Basics' }, 1))).toBe(true);
    expect(curriculumRowChanged(row, curriculumJsonToRowData({ ...base, kind: 'drill' as const }, 1))).toBe(true);
  });
});
