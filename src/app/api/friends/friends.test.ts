import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory db covering what the friends routes touch.
type F = { id: string; requesterId: string; addresseeId: string; status: string; respondedAt?: Date | null };
let friendships: F[] = [];
let users: { id: string; email: string; name: string | null }[] = [];
let topicWhere: any = null;
let me = 'alice';

const matchF = (f: F, w: any): boolean => {
  if (w.id && f.id !== w.id) return false;
  if (w.status && f.status !== w.status) return false;
  if (w.requesterId && f.requesterId !== w.requesterId) return false;
  if (w.addresseeId && f.addresseeId !== w.addresseeId) return false;
  if (w.OR) return w.OR.some((o: any) => matchF(f, o));
  return true;
};

vi.mock('@/lib/db', () => ({
  db: {
    friendship: {
      findMany: async ({ where }: any) =>
        friendships.filter((f) => matchF(f, where)).map((f) => ({
          ...f,
          requester: users.find((u) => u.id === f.requesterId),
          addressee: users.find((u) => u.id === f.addresseeId),
        })),
      findFirst: async ({ where }: any) => friendships.find((f) => matchF(f, where)) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `f${friendships.length + 1}`, status: 'pending', ...data };
        friendships.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(friendships.find((f) => f.id === where.id)!, data),
      delete: async ({ where }: any) => {
        friendships = friendships.filter((f) => f.id !== where.id);
      },
    },
    user: {
      findUnique: async ({ where }: any) => users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
    },
    topic: {
      findMany: async ({ where }: any) => {
        if (where.shared) topicWhere = where;
        return [];
      },
    },
    goal: { findMany: async () => [] },
    studyTimeEntry: { aggregate: async () => ({ _sum: { seconds: 0 } }) },
    rateLimitHit: {
      upsert: async () => ({ count: 1 }),
      findUnique: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
  },
}));
vi.mock('@/lib/apiAuth', () => ({ requireAuth: () => ({ userId: me }) }));

import { GET as listFriends, POST as sendRequest } from './route';
import { POST as act } from './[id]/route';
import { GET as viewFriend } from './view/[userId]/route';

const json = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
const as = (who: string) => { me = who; };

beforeEach(() => {
  friendships = [];
  topicWhere = null;
  users = [
    { id: 'alice', email: 'alice@example.com', name: 'Alice' },
    { id: 'bob', email: 'bob@example.com', name: null },
    { id: 'carol', email: 'carol@example.com', name: 'Carol' },
  ];
  as('alice');
});

describe('friend requests', () => {
  it('gives the same reply for known and unknown emails', async () => {
    const known = await (await sendRequest(json({ email: 'bob@example.com' }))).json();
    const unknown = await (await sendRequest(json({ email: 'nobody@example.com' }))).json();
    expect(known).toEqual(unknown);
    expect(friendships).toHaveLength(1);
  });

  it('refuses to friend yourself', async () => {
    expect((await sendRequest(json({ email: 'alice@example.com' }))).status).toBe(400);
  });

  it('asking back accepts an existing request instead of duplicating it', async () => {
    await sendRequest(json({ email: 'bob@example.com' }));
    as('bob');
    await sendRequest(json({ email: 'alice@example.com' }));
    expect(friendships).toHaveLength(1);
    expect(friendships[0].status).toBe('accepted');
  });
});

describe('request actions', () => {
  beforeEach(async () => {
    await sendRequest(json({ email: 'bob@example.com' })); // alice -> bob, id f1
  });

  it('only the addressee can accept', async () => {
    expect((await act(json({ action: 'accept' }), { params: { id: 'f1' } })).status).toBe(400); // alice
    as('bob');
    expect((await act(json({ action: 'accept' }), { params: { id: 'f1' } })).status).toBe(200);
    expect(friendships[0].status).toBe('accepted');
  });

  it('a stranger cannot touch the request at all', async () => {
    as('carol');
    expect((await act(json({ action: 'accept' }), { params: { id: 'f1' } })).status).toBe(404);
    expect(friendships[0].status).toBe('pending');
  });

  it('the requester can cancel; the addressee can decline', async () => {
    expect((await act(json({ action: 'cancel' }), { params: { id: 'f1' } })).status).toBe(200);
    expect(friendships).toHaveLength(0);
    await sendRequest(json({ email: 'bob@example.com' }));
    as('bob');
    expect((await act(json({ action: 'decline' }), { params: { id: friendships[0].id } })).status).toBe(200);
    expect(friendships).toHaveLength(0);
  });

  it('pending requests show on both sides', async () => {
    const mine = await (await listFriends()).json();
    expect(mine.outgoing.map((r: any) => r.user.id)).toEqual(['bob']);
    as('bob');
    const theirs = await (await listFriends()).json();
    expect(theirs.incoming.map((r: any) => r.user.name)).toEqual(['Alice']);
  });
});

describe('viewing a friend', () => {
  it('is 404 until the request is accepted, then reads shared rows only', async () => {
    await sendRequest(json({ email: 'bob@example.com' }));
    expect((await viewFriend(new Request('http://x'), { params: { userId: 'bob' } })).status).toBe(404);

    as('bob');
    await act(json({ action: 'accept' }), { params: { id: 'f1' } });
    as('alice');
    const res = await viewFriend(new Request('http://x'), { params: { userId: 'bob' } });
    expect(res.status).toBe(200);
    expect(topicWhere).toMatchObject({ userId: 'bob', shared: true, deletedAt: null });
    expect((await res.json()).friend.name).toBe('bob'); // no name set: falls back to the email's local part
  });

  it('a stranger gets 404', async () => {
    as('carol');
    expect((await viewFriend(new Request('http://x'), { params: { userId: 'alice' } })).status).toBe(404);
  });
});
