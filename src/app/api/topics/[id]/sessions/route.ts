import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { ensureUpcomingSessions, importSessions, NoUsableSessionsError, sessionPrompt } from '@/lib/program/sessionServer';
import { extractJson, fixPrompt } from '@/lib/ai/manual';
import { logManualImport } from '@/lib/ai/callLog';

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

/**
 * Prepares the next few days (no-op while two or more are still waiting).
 * With { mode: 'manual' }: step "prompt" returns the prompt for the learner's
 * own ChatGPT/Claude, step "import" saves the days from their pasted reply.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { mode?: unknown; step?: unknown; reply?: unknown };
  if (body.mode === 'manual') {
    if (body.step !== 'import') {
      const p = await sessionPrompt(db, userId, params.id);
      return p ? NextResponse.json(p) : NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }
    const found = extractJson(typeof body.reply === 'string' ? body.reply : '');
    try {
      if (!found.ok) throw new NoUsableSessionsError();
      const { created } = await importSessions(db, userId, params.id, found.value);
      await logManualImport('practice.sessions', userId);
      const sessions = await db.practiceSession.findMany({ where: { userId, topicId: params.id }, orderBy: { day: 'asc' } });
      return NextResponse.json({ created, sessions });
    } catch (e) {
      if (!(e instanceof NoUsableSessionsError) && found.ok) {
        console.error('Failed to save imported sessions:', e);
        return NextResponse.json({ error: 'Could not save these days right now. Try again.' }, { status: 500 });
      }
      const problems = [found.ok ? (e as Error).message : found.problem];
      return NextResponse.json({ error: 'That reply couldn’t be used.', problems, fixPrompt: fixPrompt(problems) }, { status: 422 });
    }
  }

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
