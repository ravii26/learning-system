import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { ensureUpcomingSessions } from '@/lib/program/sessionServer';

export const maxDuration = 120;

/** A practice topic's daily sessions, oldest first. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  const sessions = await db.practiceSession.findMany({ where: { userId, topicId: params.id }, orderBy: { day: 'asc' } });
  return NextResponse.json({ sessions, aiAvailable: hasAnyAIProviderConfigured() });
}

/** Prepares the next few days (no-op while two or more are still waiting). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  if (!hasAnyAIProviderConfigured()) return NextResponse.json({ error: 'Writing sessions needs the AI, which is not set up.' }, { status: 503 });
  const overQuota = await aiQuotaGate(userId);
  if (overQuota) return overQuota;
  try {
    const { created } = await ensureUpcomingSessions(db, userId, params.id);
    const sessions = await db.practiceSession.findMany({ where: { userId, topicId: params.id }, orderBy: { day: 'asc' } });
    return NextResponse.json({ created, sessions });
  } catch (e) {
    console.error('Failed to write practice sessions:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not prepare your sessions right now. Try again in a minute.' }, { status: 502 });
  }
}
