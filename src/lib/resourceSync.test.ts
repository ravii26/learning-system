import { describe, it, expect } from 'vitest';
import { planResourceSync, resourceJsonToRowData, resourceRowToJson } from './resourceSync';

const res = (title: string, extra: Record<string, unknown> = {}) => ({
  title, type: 'ARTICLE', url: `https://x/${title}`, purpose: '', status: 'NOT_STARTED', notes: '', ...extra,
});
const row = (legacyId: string, title: string, extra: Record<string, unknown> = {}) => ({
  legacyId, title, type: 'ARTICLE', url: `https://x/${title}`, ...extra,
});

describe('planResourceSync', () => {
  it('creates rows with fresh ids for id-less legacy entries on first sync', () => {
    const plan = planResourceSync([], [res('a'), res('b')]);
    expect(plan.upserts.every((u) => u.isNew)).toBe(true);
    expect(new Set(plan.upserts.map((u) => u.legacyId)).size).toBe(2);
  });

  it('matches id-less entries to existing rows by title+url+type instead of duplicating', () => {
    // The page re-sends its whole id-less array on every edit (e.g. a status toggle).
    const plan = planResourceSync([row('r1', 'a'), row('r2', 'b')], [res('a', { status: 'IN_PROGRESS' }), res('b')]);
    expect(plan.upserts.map((u) => [u.legacyId, u.isNew])).toEqual([['r1', false], ['r2', false]]);
    expect(plan.upserts[0].data.status).toBe('IN_PROGRESS');
    expect(plan.removeLegacyIds).toEqual([]);
  });

  it('keeps two identical bookmarks as two rows — each row is claimed once', () => {
    const plan = planResourceSync([row('r1', 'a'), row('r2', 'a')], [res('a'), res('a')]);
    expect(plan.upserts.map((u) => u.legacyId).sort()).toEqual(['r1', 'r2']);
  });

  it('an id-carrying entry claims its row before an id-less duplicate can', () => {
    const plan = planResourceSync([row('r1', 'a')], [res('a'), res('a', { id: 'r1' })]);
    const explicit = plan.upserts.find((u) => u.legacyId === 'r1');
    expect(explicit).toBeDefined();
    expect(plan.upserts.filter((u) => u.isNew)).toHaveLength(1); // the id-less copy becomes a new row
  });

  it('soft-removes rows whose entry was deleted (index-based delete in the UI)', () => {
    const plan = planResourceSync([row('r1', 'a'), row('r2', 'b'), row('r3', 'c')], [res('a'), res('c')]);
    expect(plan.removeLegacyIds).toEqual(['r2']);
  });

  it('matches by id once the mirror has handed ids back', () => {
    const plan = planResourceSync([row('r1', 'a')], [res('renamed', { id: 'r1' })]);
    expect(plan.upserts).toEqual([expect.objectContaining({ legacyId: 'r1', isNew: false })]);
    expect(plan.upserts[0].data.title).toBe('renamed');
  });

  it('records array position as order', () => {
    const plan = planResourceSync([], [res('a'), res('b'), res('c')]);
    expect(plan.upserts.map((u) => u.data.order)).toEqual([0, 1, 2]);
  });
});

describe('resource mapping', () => {
  it('round-trips through row data and back', () => {
    const json = { id: 'r9', ...res('doc', { purpose: 'why', notes: 'n', status: 'COMPLETED' }) };
    const data = resourceJsonToRowData(json, 0);
    expect(resourceRowToJson({ legacyId: 'r9', ...data })).toEqual(json);
  });

  it('fills safe defaults for missing fields', () => {
    const data = resourceJsonToRowData({}, 2);
    expect(data).toMatchObject({ title: 'Untitled resource', type: 'OTHER', url: '', status: 'NOT_STARTED', order: 2 });
  });
});
