import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The plan stays inside your own Focus and accepts only sensible days. */

vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: 'u1' }) }));
vi.mock('@/lib/focusData', async (original) => ({ ...(await original<typeof import('@/lib/focusData')>()), loadFocus: async () => [] }));

const state: { items: Array<{ id: string; userId: string; skippedDay: string | null; addedDay: string | null }>; entries: any[] } = { items: [], entries: [] };

vi.mock('@/lib/db', () => {
  const db: any = {
    focusItem: {
      findMany: async ({ where }: any) => state.items.filter((i) => i.userId === where.userId && where.id.in.includes(i.id)),
      findFirst: async ({ where }: any) => state.items.find((i) => i.id === where.id && i.userId === where.userId) ?? null,
      update: async ({ where, data }: any) => { Object.assign(state.items.find((i) => i.id === where.id)!, data); },
    },
    planEntry: {
      findMany: async () => [],
      deleteMany: async ({ where }: any) => {
        state.entries = state.entries.filter((e) => {
          if (where.focusItemId) {
            const matchDay = typeof where.day === 'string' ? e.day === where.day : e.day <= where.day.lte;
            return !(e.focusItemId === where.focusItemId && matchDay);
          }
          return false;
        });
      },
      createMany: async ({ data }: any) => { state.entries.push(...data); },
      aggregate: async () => ({ _max: { position: null } }),
      upsert: async ({ create }: any) => { state.entries.push(create); },
    },
  };
  db.$transaction = async (arg: any) => (typeof arg === 'function' ? arg(db) : Promise.all(arg));
  return { db };
});

const req = (body: unknown, method = 'POST') => new Request('http://x', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const today = new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  state.items = [{ id: 'mine', userId: 'u1', skippedDay: null, addedDay: null }, { id: 'theirs', userId: 'u2', skippedDay: null, addedDay: null }];
  state.entries = [];
});

describe('PUT /api/plan', () => {
  it('saves days from today onward and ignores past days', async () => {
    const { PUT } = await import('./plan/route');
    const res = await PUT(req({ tz: 0, cells: [{ focusItemId: 'mine', day: today }, { focusItemId: 'mine', day: '2020-01-01' }] }, 'PUT'));
    expect(res.status).toBe(200);
    expect(state.entries.map((e) => e.day)).toEqual([today]);
  });

  it('refuses someone else\'s item', async () => {
    const { PUT } = await import('./plan/route');
    expect((await PUT(req({ tz: 0, cells: [{ focusItemId: 'theirs', day: today }] }, 'PUT'))).status).toBe(404);
    expect(state.entries).toEqual([]);
  });
});

describe('POST /api/plan/move', () => {
  const load = () => import('./plan/move/route');

  it('moves to tomorrow and takes it off today', async () => {
    state.entries = [{ focusItemId: 'mine', day: today }];
    const { POST } = await load();
    expect((await POST(req({ tz: 0, focusItemId: 'mine', to: inDays(1) }))).status).toBe(200);
    expect(state.entries.map((e) => e.day)).toEqual([inDays(1)]);
    expect(state.items[0].skippedDay).toBe(today);
  });

  it('takes it off the plan with later', async () => {
    state.entries = [{ focusItemId: 'mine', day: today }];
    const { POST } = await load();
    await POST(req({ tz: 0, focusItemId: 'mine', to: 'later' }));
    expect(state.entries).toEqual([]);
  });

  it('brings something into today', async () => {
    const { POST } = await load();
    await POST(req({ tz: 0, focusItemId: 'mine', to: today }));
    expect(state.items[0].addedDay).toBe(today);
    expect(state.entries.map((e) => e.day)).toEqual([today]);
  });

  it('refuses a day in the past', async () => {
    const { POST } = await load();
    expect((await POST(req({ tz: 0, focusItemId: 'mine', to: '2020-01-01' }))).status).toBe(400);
  });

  it('will not move someone else\'s item', async () => {
    const { POST } = await load();
    expect((await POST(req({ tz: 0, focusItemId: 'theirs', to: 'later' }))).status).toBe(404);
  });
});
