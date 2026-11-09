import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Adding selected lesson text to a module's notes appends to what is stored. */

vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: 'u1' }) }));
vi.mock('@/lib/curriculumSync', () => ({ mirrorCurriculumToJson: async () => [] }));

const state: { item: { id: string; userId: string; topicId: string; legacyId: string; notes: string } | null; updates: any[]; mirrored: number } = {
  item: null, updates: [], mirrored: 0,
};

vi.mock('@/lib/db', () => {
  const tx = {
    curriculumItem: {
      findFirst: async ({ where }: any) => {
        const i = state.item;
        return i && i.userId === where.userId && i.topicId === where.topicId && i.legacyId === where.legacyId ? i : null;
      },
      update: async (a: any) => { state.updates.push(a); },
    },
    topic: { update: async () => { state.mirrored++; } },
  };
  return { db: { $transaction: async (fn: any) => fn(tx) } };
});

const post = (body: unknown) => new Request('http://x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ctx = { params: { id: 't1', moduleId: 'm1' } };
const load = () => import('./topics/[id]/modules/[moduleId]/notes/route');

beforeEach(() => {
  state.item = { id: 'row1', userId: 'u1', topicId: 't1', legacyId: 'm1', notes: '<p>mine</p>' };
  state.updates = [];
  state.mirrored = 0;
});

describe('POST module notes', () => {
  it('appends the quote after the stored notes and keeps the JSON copy in step', async () => {
    const { POST } = await load();
    const res = await POST(post({ quote: 'Move the left pointer' }), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.added).toBe('<blockquote><p>Move the left pointer</p></blockquote>');
    expect(data.notes).toBe('<p>mine</p><blockquote><p>Move the left pointer</p></blockquote>');
    expect(state.updates[0].data.notes).toBe(data.notes);
    expect(state.mirrored).toBe(1);
  });

  it('rejects empty and oversized selections without writing', async () => {
    const { POST } = await load();
    expect((await POST(post({ quote: '   ' }), ctx)).status).toBe(400);
    expect((await POST(post({ quote: 'x'.repeat(5001) }), ctx)).status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it('refuses when the notes would become too long', async () => {
    state.item!.notes = `<p>${'x'.repeat(49_990)}</p>`;
    const { POST } = await load();
    expect((await POST(post({ quote: 'one more quote' }), ctx)).status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it('does not write to a module the user does not own', async () => {
    state.item!.userId = 'someone-else';
    const { POST } = await load();
    expect((await POST(post({ quote: 'hello' }), ctx)).status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });
});
