import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "All lessons": the read-only overview, and changing what a lesson is for.
 * The promise under test: changing a kind never deletes or edits a written lesson.
 */

vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: 'u1' }) }));

type Item = { id: string; topicId: string; legacyId: string; order: number; title: string; kind: string; blueprint: unknown; completed: boolean; completedAt: Date | null; notes: string; estimatedMinutes: number; removed: boolean };
const state: { items: Item[]; saved: Array<{ topicId: string; moduleId: string; content: any }>; topicUpdates: any[]; itemUpdates: any[]; lessonWrites: number } = {
  items: [], saved: [], topicUpdates: [], itemUpdates: [], lessonWrites: 0,
};
const item = (over: Partial<Item> = {}): Item => ({
  id: 'row1', topicId: 't1', legacyId: 'm1', order: 1, title: 'Lesson one', kind: 'concept', blueprint: null, completed: false, completedAt: null, notes: '', estimatedMinutes: 20, removed: false, ...over,
});

vi.mock('@/lib/db', () => {
  const tx = {
    curriculumItem: {
      update: async ({ where, data }: any) => { state.itemUpdates.push({ where, data }); const r = state.items.find((i) => i.id === where.id)!; Object.assign(r, data); },
      findMany: async () => state.items.filter((i) => !i.removed),
    },
    topic: { update: async (a: any) => { state.topicUpdates.push(a); } },
  };
  const db: any = {
    curriculumItem: {
      findMany: async () => state.items.filter((i) => !i.removed).map((i) => ({ ...i, topic: { title: 'Web', status: 'active', mode: 'syllabus' } })),
      findFirst: async ({ where }: any) => state.items.find((i) => i.topicId === where.topicId && i.legacyId === where.legacyId && !i.removed) ?? null,
    },
    generatedLesson: {
      findMany: async () => state.saved,
      findFirst: async ({ where }: any) => state.saved.find((s) => s.topicId === where.topicId && s.moduleId === where.moduleId) ?? null,
      update: async () => { state.lessonWrites++; },
      upsert: async () => { state.lessonWrites++; },
      delete: async () => { state.lessonWrites++; },
      deleteMany: async () => { state.lessonWrites++; },
    },
    $transaction: async (fn: any) => fn(tx),
  };
  return { db };
});

const patch = (body: unknown) => new Request('http://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ctx = { params: { id: 't1', moduleId: 'm1' } };

beforeEach(() => {
  state.items = [item()];
  state.saved = [];
  state.topicUpdates = [];
  state.itemUpdates = [];
  state.lessonWrites = 0;
});

describe('GET /api/learning/overview', () => {
  it('lists every lesson with its kind and whether it is written', async () => {
    state.items = [item({ kind: 'decision' }), item({ id: 'row2', legacyId: 'm2', order: 2, title: 'Two' })];
    state.saved = [{ topicId: 't1', moduleId: 'm1', content: { kind: 'concept' } }];
    const { GET } = await import('./learning/overview/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const { rows } = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ topicTitle: 'Web', moduleId: 'm1', kind: 'decision', written: true, writtenKind: 'concept', needsRegenerate: true });
    expect(rows[1]).toMatchObject({ moduleId: 'm2', kind: 'concept', written: false, needsRegenerate: false });
  });

  it('is an empty list when there is nothing', async () => {
    state.items = [];
    const { GET } = await import('./learning/overview/route');
    expect((await (await GET()).json()).rows).toEqual([]);
  });
});

describe('PATCH /api/topics/[id]/modules/[moduleId]/kind', () => {
  it('changes the kind and keeps the topic’s mirrored syllabus in step', async () => {
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    const res = await PATCH(patch({ kind: 'decision' }), ctx);
    expect(res.status).toBe(200);
    expect(state.itemUpdates[0].data).toMatchObject({ kind: 'decision', blueprint: [] });
    const mirror = state.topicUpdates[0].data.curriculum;
    expect(mirror[0]).toMatchObject({ id: 'm1', kind: 'decision' });
    expect(await res.json()).toMatchObject({ kind: 'decision', blueprint: [], written: false, needsRegenerate: false });
  });

  it('never touches a lesson that was already written, and says it needs regenerating', async () => {
    state.saved = [{ topicId: 't1', moduleId: 'm1', content: { summary: 's', explanation: 'e' } }];
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    const body = await (await PATCH(patch({ kind: 'survey' }), ctx)).json();
    expect(body).toMatchObject({ kind: 'survey', written: true, needsRegenerate: true });
    expect(state.lessonWrites).toBe(0);
  });

  it('is not flagged when changed to what the lesson already is', async () => {
    state.saved = [{ topicId: 't1', moduleId: 'm1', content: { kind: 'roadmap' } }];
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    expect((await (await PATCH(patch({ kind: 'roadmap' }), ctx)).json()).needsRegenerate).toBe(false);
  });

  it('keeps only sections the new kind can have, in reading order', async () => {
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    const body = await (await PATCH(patch({ kind: 'roadmap', blueprint: ['decision_flow', 'cost_chart', 'timeline', 'banana'] }), ctx)).json();
    expect(body.blueprint).toEqual(['timeline', 'decision_flow']);
  });

  it('a change of kind resets the sections to the default when none are given', async () => {
    state.items = [item({ kind: 'decision', blueprint: ['comparison_table'] })];
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    const body = await (await PATCH(patch({ kind: 'survey' }), ctx)).json();
    expect(body.blueprint).toEqual([]);
  });

  it('refuses an unknown kind and a lesson that does not exist', async () => {
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    expect((await PATCH(patch({ kind: 'banana' }), ctx)).status).toBe(400);
    expect((await PATCH(patch({}), ctx)).status).toBe(400);
    expect((await PATCH(patch({ kind: 'decision' }), { params: { id: 't1', moduleId: 'nope' } })).status).toBe(404);
    expect(state.itemUpdates).toHaveLength(0);
  });

  it('accepts every kind', async () => {
    const { LESSON_KINDS } = await import('@/lib/lessonKinds');
    const { PATCH } = await import('./topics/[id]/modules/[moduleId]/kind/route');
    for (const kind of LESSON_KINDS) expect((await PATCH(patch({ kind }), ctx)).status, kind).toBe(200);
  });
});
