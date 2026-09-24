import { describe, it, expect } from 'vitest';
import { planCurriculumSync, curriculumJsonToRowData, curriculumRowToJson } from './curriculumSync';

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

  it('never stores an empty title', () => {
    expect(curriculumJsonToRowData({ title: '   ' }, 1).title).toBe('Untitled module');
  });
});
