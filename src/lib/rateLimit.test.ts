import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let hits = new Map<string, number>();
const hitKey = (w: any) => `${w.key_windowStart.key}|${w.key_windowStart.windowStart.getTime()}`;
vi.mock('./db', () => ({
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
  },
}));

import { windowStartFor, consume, peek, aiQuotaGate, consumeAiQuota, AIQuotaExceededError, DAY, MINUTE } from './rateLimit';
import { SEED_USER_ID } from './currentUser';

describe('rate limit windows', () => {
  beforeEach(() => { hits = new Map(); });

  it('aligns windows to fixed boundaries', () => {
    const t = Date.UTC(2026, 8, 27, 10, 7, 30);
    expect(windowStartFor(t, 15 * MINUTE).toISOString()).toBe('2026-09-27T10:00:00.000Z');
    expect(windowStartFor(t, DAY).toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('consume blocks past the limit; peek blocks once it is used up', async () => {
    const now = Date.UTC(2026, 8, 27, 10);
    for (let i = 1; i <= 3; i++) expect((await consume('k', 3, MINUTE, now)).blocked).toBe(false);
    expect((await peek('k', 3, MINUTE, now)).blocked).toBe(true);
    expect((await consume('k', 3, MINUTE, now)).blocked).toBe(true);
  });

  it('starts fresh in the next window', async () => {
    const now = Date.UTC(2026, 8, 27, 10);
    for (let i = 0; i < 5; i++) await consume('k', 3, MINUTE, now);
    expect((await peek('k', 3, MINUTE, now + MINUTE)).blocked).toBe(false);
  });
});

describe('daily AI quota', () => {
  const original = process.env.AI_DAILY_LIMIT;
  beforeEach(() => { hits = new Map(); process.env.AI_DAILY_LIMIT = '2'; });
  afterEach(() => {
    if (original === undefined) delete process.env.AI_DAILY_LIMIT;
    else process.env.AI_DAILY_LIMIT = original;
  });

  it('allows the limit, then the gate returns 429 and consume throws', async () => {
    await consumeAiQuota('u1');
    await consumeAiQuota('u1');
    const gate = await aiQuotaGate('u1');
    expect(gate?.status).toBe(429);
    await expect(consumeAiQuota('u1')).rejects.toBeInstanceOf(AIQuotaExceededError);
  });

  it('keeps users separate', async () => {
    await consumeAiQuota('u1');
    await consumeAiQuota('u1');
    expect(await aiQuotaGate('u2')).toBeNull();
  });

  it('exempts the owner workspace', async () => {
    for (let i = 0; i < 5; i++) await consumeAiQuota(SEED_USER_ID);
    expect(await aiQuotaGate(SEED_USER_ID)).toBeNull();
  });
});
