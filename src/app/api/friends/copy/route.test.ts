import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bob owns two topics; only one is shared. Alice is Bob's friend, Carol isn't.
const bobTopics = [
  { id: 'shared-t', userId: 'bob', shared: true, deletedAt: null, title: 'React', area: 'Tech', mode: 'syllabus', topicMode: null, depthTarget: 'Proficiency', rubricTemplate: null,
    curriculumItems: [{ legacyId: 'm1', order: 1, title: 'Hooks', estimatedMinutes: 30 }], resourceRows: [] },
  { id: 'private-t', userId: 'bob', shared: false, deletedAt: null, title: 'Secret', area: 'Tech', mode: 'syllabus', topicMode: null, depthTarget: null, rubricTemplate: null,
    curriculumItems: [], resourceRows: [] },
];
let created: any[] = [];
let me = 'alice';

vi.mock('@/lib/db', () => {
  const topic = {
    findFirst: async ({ where }: any) => {
      if (where.copiedFromId) return created.find((c) => c.userId === where.userId && c.copiedFromId === where.copiedFromId) ?? null;
      return bobTopics.find((t) => t.id === where.id && (where.shared === undefined || t.shared === where.shared)) ?? null;
    },
    create: async ({ data }: any) => {
      const row = { id: `copy-${created.length + 1}`, ...data };
      created.push(row);
      return row;
    },
    update: async () => ({}),
  };
  const tx = { topic, curriculumItem: { findMany: async () => [], upsert: async () => ({}), updateMany: async () => ({}) },
    resource: { findMany: async () => [], upsert: async () => ({}), updateMany: async () => ({}) },
    skill: { upsert: async () => ({ id: 'skill-1' }) } };
  return {
    db: {
      ...tx,
      $transaction: async (fn: any) => fn(tx),
      friendship: {
        findFirst: async ({ where }: any) => {
          const pair = where.OR.map((o: any) => `${o.requesterId}>${o.addresseeId}`);
          return pair.includes('alice>bob') || pair.includes('bob>alice') ? { id: 'f1' } : null;
        },
      },
      goal: { findFirst: async () => null },
    },
  };
});
vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: me }) }));

import { POST } from './route';

const copy = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  created = [];
  me = 'alice';
});

describe('POST /api/friends/copy', () => {
  it("copies a friend's shared topic into your Next list with fresh progress", async () => {
    const res = await copy({ kind: 'topic', id: 'shared-t' });
    expect(res.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ userId: 'alice', status: 'queued', progressPct: 0, copiedFromId: 'shared-t', title: 'React' });
    expect(created[0].curriculum[0]).toMatchObject({ id: 'm1', completed: false, notes: '' });
  });

  it('copying twice returns your existing copy', async () => {
    await copy({ kind: 'topic', id: 'shared-t' });
    const again = await (await copy({ kind: 'topic', id: 'shared-t' })).json();
    expect(again).toEqual({ topicId: 'copy-1', created: false });
    expect(created).toHaveLength(1);
  });

  it("refuses an unshared topic, even from a friend", async () => {
    expect((await copy({ kind: 'topic', id: 'private-t' })).status).toBe(404);
    expect(created).toHaveLength(0);
  });

  it('refuses non-friends', async () => {
    me = 'carol';
    expect((await copy({ kind: 'topic', id: 'shared-t' })).status).toBe(404);
    expect(created).toHaveLength(0);
  });
});
