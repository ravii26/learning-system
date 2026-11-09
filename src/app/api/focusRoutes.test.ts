import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Pinning stays inside your own data, and a pin is never created twice. */

vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: 'u1' }) }));

type Pin = { id: string; userId: string; kind: string; goalId: string | null; topicId: string | null; moduleId: string | null; title: string | null; rhythm: string; targetDate: Date | null; doneAt: Date[]; skippedDay: string | null; addedDay: string | null; completedAt: Date | null };
const state: { pins: Pin[]; goals: Array<{ id: string; userId: string }>; topics: Array<{ id: string; userId: string }>; setupAt: Date | null } = { pins: [], goals: [], topics: [], setupAt: null };

vi.mock('@/lib/db', () => {
  const db: any = {
    goal: { findFirst: async ({ where }: any) => state.goals.find((g) => g.id === where.id && g.userId === where.userId) ?? null },
    topic: { findFirst: async ({ where }: any) => state.topics.find((t) => t.id === where.id && t.userId === where.userId) ?? null },
    curriculumItem: { findFirst: async () => null },
    user: { update: async ({ data }: any) => { state.setupAt = data.focusSetupAt; } },
    focusItem: {
      findFirst: async ({ where }: any) => state.pins.find((p) => Object.entries(where).every(([k, v]) => (p as any)[k] === v)) ?? null,
      create: async ({ data }: any) => {
        const pin = { id: `p${state.pins.length + 1}`, goalId: null, topicId: null, moduleId: null, title: null, rhythm: 'few_weekly', targetDate: null, doneAt: [], skippedDay: null, addedDay: null, completedAt: null, ...data };
        state.pins.push(pin);
        return pin;
      },
      update: async ({ where, data }: any) => { Object.assign(state.pins.find((p) => p.id === where.id)!, data); },
      deleteMany: async ({ where }: any) => {
        const before = state.pins.length;
        state.pins = state.pins.filter((p) => !(p.id === where.id && p.userId === where.userId));
        return { count: before - state.pins.length };
      },
    },
  };
  db.$transaction = async (fn: any) => fn(db);
  return { db };
});

const req = (body: unknown) => new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const list = () => import('./focus/route');
const one = () => import('./focus/[id]/route');
const ctx = (id: string) => ({ params: { id } });

beforeEach(() => {
  state.pins = [];
  state.goals = [{ id: 'g1', userId: 'u1' }, { id: 'theirs', userId: 'u2' }];
  state.topics = [{ id: 't1', userId: 'u1' }];
  state.setupAt = null;
});

describe('POST /api/focus', () => {
  it('pins your goal', async () => {
    const { POST } = await list();
    expect((await POST(req({ kind: 'goal', goalId: 'g1', rhythm: 'daily' }))).status).toBe(200);
    expect(state.pins[0]).toMatchObject({ kind: 'goal', goalId: 'g1', rhythm: 'daily' });
  });

  it('refuses a goal that belongs to someone else', async () => {
    const { POST } = await list();
    expect((await POST(req({ kind: 'goal', goalId: 'theirs' }))).status).toBe(404);
    expect(state.pins).toHaveLength(0);
  });

  it('updates an existing pin instead of adding another', async () => {
    const { POST } = await list();
    await POST(req({ kind: 'topic', topicId: 't1', rhythm: 'daily' }));
    await POST(req({ kind: 'topic', topicId: 't1', rhythm: 'when_i_can' }));
    expect(state.pins).toHaveLength(1);
    expect(state.pins[0].rhythm).toBe('when_i_can');
  });

  it('requires a date for "by a date"', async () => {
    const { POST } = await list();
    expect((await POST(req({ kind: 'topic', topicId: 't1', rhythm: 'by_date' }))).status).toBe(400);
  });

  it('accepts a custom item and needs a title', async () => {
    const { POST } = await list();
    expect((await POST(req({ kind: 'custom', title: '  ' }))).status).toBe(400);
    expect((await POST(req({ kind: 'custom', title: 'Read chapter 3', rhythm: 'once' }))).status).toBe(200);
    expect(state.pins[0].title).toBe('Read chapter 3');
  });
});

describe('PATCH /api/focus/[id]', () => {
  const pin = (over: Partial<Pin> = {}) => {
    state.pins.push({ id: 'p1', userId: 'u1', kind: 'custom', goalId: null, topicId: null, moduleId: null, title: 'x', rhythm: 'daily', targetDate: null, doneAt: [], skippedDay: null, addedDay: null, completedAt: null, ...over });
  };

  it('records a done item, and a "just once" item leaves for good', async () => {
    pin({ rhythm: 'once' });
    const { PATCH } = await one();
    await PATCH(req({ action: 'done', tz: 0 }), ctx('p1'));
    expect(state.pins[0].doneAt).toHaveLength(1);
    expect(state.pins[0].completedAt).toBeInstanceOf(Date);
  });

  it('keeps a daily item pinned when done', async () => {
    pin();
    const { PATCH } = await one();
    await PATCH(req({ action: 'done', tz: 0 }), ctx('p1'));
    expect(state.pins[0].completedAt).toBeNull();
  });

  it('undoes today\'s done', async () => {
    pin({ rhythm: 'once', doneAt: [new Date()], completedAt: new Date() });
    const { PATCH } = await one();
    await PATCH(req({ action: 'undo', tz: 0 }), ctx('p1'));
    expect(state.pins[0].doneAt).toHaveLength(0);
    expect(state.pins[0].completedAt).toBeNull();
  });

  it('skipping undoes adding for today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    pin({ addedDay: today });
    const { PATCH } = await one();
    await PATCH(req({ action: 'skip', tz: 0 }), ctx('p1'));
    expect(state.pins[0]).toMatchObject({ skippedDay: today, addedDay: null });
  });

  it('will not touch someone else\'s pin', async () => {
    pin({ userId: 'u2' });
    const { PATCH } = await one();
    expect((await PATCH(req({ action: 'done', tz: 0 }), ctx('p1'))).status).toBe(404);
    expect(state.pins[0].doneAt).toHaveLength(0);
  });
});

describe('POST /api/focus/setup', () => {
  it('skipping marks setup finished and pins nothing', async () => {
    const { POST } = await import('./focus/setup/route');
    expect((await POST(req({ pins: [] }))).status).toBe(200);
    expect(state.setupAt).toBeInstanceOf(Date);
    expect(state.pins).toHaveLength(0);
  });

  it('saves your choices', async () => {
    const { POST } = await import('./focus/setup/route');
    await POST(req({ pins: [{ kind: 'goal', goalId: 'g1', rhythm: 'daily' }] }));
    expect(state.pins).toHaveLength(1);
  });

  it('saves nothing when one choice is invalid', async () => {
    const { POST } = await import('./focus/setup/route');
    expect((await POST(req({ pins: [{ kind: 'goal', goalId: 'theirs' }] }))).status).toBe(404);
    expect(state.setupAt).toBeNull();
  });
});
