import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hashPassword } from '@/lib/password';
import { SEED_USER_ID } from '@/lib/currentUser';

// In-memory stand-in for db.user, keyed by id.
type Row = { id: string; email: string | null; passwordHash: string | null; name: string | null };
let users: Row[] = [];
const byWhere = (w: { id?: string; email?: string }) =>
  users.find((u) => (w.id ? u.id === w.id : u.email === w.email)) ?? null;

vi.mock('@/lib/db', () => ({
  db: {
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
});
