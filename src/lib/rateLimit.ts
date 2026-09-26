import { NextResponse } from 'next/server';
import { db } from './db';
import { SEED_USER_ID } from './currentUser';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function windowStartFor(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export interface LimitState {
  count: number;
  limit: number;
  blocked: boolean;
  resetAt: Date;
}

const state = (count: number, limit: number, start: Date, windowMs: number): LimitState => ({
  count,
  limit,
  blocked: count > limit,
  resetAt: new Date(start.getTime() + windowMs),
});

/** Records one hit and reports whether the caller is now over the limit. */
export async function consume(key: string, limit: number, windowMs: number, now = Date.now()): Promise<LimitState> {
  const windowStart = windowStartFor(now, windowMs);
  const bump = () =>
    db.rateLimitHit.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
  let row;
  try {
    row = await bump();
  } catch {
    row = await bump(); // two first-hits raced on create; the retry increments
  }
  if (Math.random() < 0.01) {
    db.rateLimitHit.deleteMany({ where: { windowStart: { lt: new Date(now - 2 * DAY) } } }).catch(() => {});
  }
  return state(row.count, limit, windowStart, windowMs);
}

/** Reads the current window without recording a hit. Blocked once the limit is used up. */
export async function peek(key: string, limit: number, windowMs: number, now = Date.now()): Promise<LimitState> {
  const windowStart = windowStartFor(now, windowMs);
  const row = await db.rateLimitHit.findUnique({ where: { key_windowStart: { key, windowStart } }, select: { count: true } });
  const s = state(row?.count ?? 0, limit, windowStart, windowMs);
  return { ...s, blocked: s.count >= limit };
}

export function tooManyRequests(message: string, s: LimitState) {
  const retryAfter = Math.max(1, Math.ceil((s.resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json({ error: message, retryAfter }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown').trim();
}

// ---- Daily AI quota -------------------------------------------------------

/** Calls per user per UTC day. The owner (original workspace) is exempt. */
export function aiDailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

const aiKey = (userId: string) => `ai:${userId}`;
const aiExempt = (userId: string) => userId === SEED_USER_ID;

export class AIQuotaExceededError extends Error {
  constructor(public readonly resetAt: Date) {
    super('Daily AI limit reached');
    this.name = 'AIQuotaExceededError';
  }
}

/** Route-entry check: a 429 response when the user has no AI calls left today, else null. */
export async function aiQuotaGate(userId: string): Promise<NextResponse | null> {
  if (aiExempt(userId)) return null;
  const s = await peek(aiKey(userId), aiDailyLimit(), DAY);
  return s.blocked
    ? tooManyRequests(`You've used today's ${s.limit} AI requests. They reset at midnight UTC.`, s)
    : null;
}

/** Counts one AI call; throws AIQuotaExceededError if it goes over. */
export async function consumeAiQuota(userId: string): Promise<void> {
  if (aiExempt(userId)) return;
  const s = await consume(aiKey(userId), aiDailyLimit(), DAY);
  if (s.blocked) throw new AIQuotaExceededError(s.resetAt);
}
