import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashPassword } from '@/lib/password';
import { SEED_USER_ID } from '@/lib/currentUser';

// In-memory stand-in for db.user, keyed by id.
type Row = { id: string; email: string | null; passwordHash: string | null; name: string | null };
let users: Row[] = [];
const byWhere = (w: { id?: string; email?: string }) =>
  users.find((u) => (w.id ? u.id === w.id : u.email === w.email)) ?? null;

let hits = new Map<string, number>();
const hitKey = (w: any) => `${w.key_windowStart.key}|${w.key_windowStart.windowStart.getTime()}`;

vi.mock('@/lib/db', () => ({
  db: {
    rateLimitHit: {
      findUnique: async ({ where }: any) => (hits.has(hitKey(where)) ? { count: hits.get(hitKey(where)) } : null),
      upsert: async ({ where }: any) => {
        const k = hitKey(where);
        hits.set(k, (hits.get(k) ?? 0) + 1);
        return { count: hits.get(k) };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    user: {
      findUnique: async ({ where }: any) => byWhere(where),
      create: async ({ data }: any) => {
        const row = { id: `u${users.length + 1}`, email: null, passwordHash: null, name: null, ...data };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(byWhere(where)!, data),
    },
  },
}));

const signedIn: string[] = [];
vi.mock('@/lib/auth', () => ({
  checkPassword: (p: string) => p === 'app-pass',
  signSessionToken: (id: string) => id,
  setSessionCookie: (token: string) => signedIn.push(token),
  clearSessionCookie: () => {},
  getSessionUserId: () => null,
}));

import { POST } from './route';

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/auth', { method: 'POST', body: JSON.stringify(body) }));

describe('POST /api/auth', () => {
  const original = process.env.ALLOW_SIGNUP;

  beforeEach(() => {
    users = [{ id: SEED_USER_ID, email: 'owner@example.com', passwordHash: null, name: null }];
    signedIn.length = 0;
    hits = new Map();
    process.env.ALLOW_SIGNUP = 'true';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_SIGNUP;
    else process.env.ALLOW_SIGNUP = original;
  });

  it('signs up, then signs in with the same credentials', async () => {
    expect((await post({ action: 'signup', email: 'New@Example.com', password: 'longenough' })).status).toBe(200);
    const created = users.find((u) => u.email === 'new@example.com')!;
    expect(created.passwordHash).toMatch(/^scrypt\$/);

    signedIn.length = 0;
    expect((await post({ email: 'new@example.com', password: 'longenough' })).status).toBe(200);
    expect(signedIn).toEqual([created.id]);
    expect((await post({ email: 'new@example.com', password: 'wrong-one' })).status).toBe(401);
  });

  it('keeps sign-up closed unless ALLOW_SIGNUP=true', async () => {
    delete process.env.ALLOW_SIGNUP;
    expect((await post({ action: 'signup', email: 'x@y.co', password: 'longenough' })).status).toBe(403);
    expect(users).toHaveLength(1);
  });

  it('refuses to sign up with the owner email (no account takeover)', async () => {
    expect((await post({ action: 'signup', email: 'owner@example.com', password: 'longenough' })).status).toBe(409);
  });

  it('rejects short passwords', async () => {
    expect((await post({ action: 'signup', email: 'x@y.co', password: 'short' })).status).toBe(400);
  });

  it('claim needs the app password, then retires it', async () => {
    expect((await post({ action: 'claim', email: 'owner@example.com', password: 'ownerpass1', appPassword: 'nope' })).status).toBe(401);
    expect((await post({ password: 'app-pass' })).status).toBe(200); // legacy works while unclaimed

    expect((await post({ action: 'claim', email: 'owner@example.com', password: 'ownerpass1', appPassword: 'app-pass' })).status).toBe(200);
    expect(users[0].passwordHash).toMatch(/^scrypt\$/);

    expect((await post({ password: 'app-pass' })).status).toBe(401); // legacy retired
    expect((await post({ action: 'claim', email: 'owner@example.com', password: 'another1', appPassword: 'app-pass' })).status).toBe(409);
    signedIn.length = 0;
    expect((await post({ email: 'owner@example.com', password: 'ownerpass1' })).status).toBe(200);
    expect(signedIn).toEqual([SEED_USER_ID]);
  });

  it('locks an email out after repeated failures, even for the right password', async () => {
    await post({ action: 'signup', email: 'target@example.com', password: 'rightpass1' });
    for (let i = 0; i < 8; i++) {
      expect((await post({ email: 'target@example.com', password: 'guess' + i })).status).toBe(401);
    }
    const locked = await post({ email: 'target@example.com', password: 'rightpass1' });
    expect(locked.status).toBe(429);
    expect(locked.headers.get('Retry-After')).toBeTruthy();
  });

  it('does not count successful sign-ins toward the lockout', async () => {
    await post({ action: 'signup', email: 'fine@example.com', password: 'rightpass1' });
    for (let i = 0; i < 12; i++) {
      expect((await post({ email: 'fine@example.com', password: 'rightpass1' })).status).toBe(200);
    }
  });

  it('caps sign-ups per network per hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post({ action: 'signup', email: `u${i}@example.com`, password: 'longenough' })).status).toBe(200);
    }
    expect((await post({ action: 'signup', email: 'u9@example.com', password: 'longenough' })).status).toBe(429);
  });
});
