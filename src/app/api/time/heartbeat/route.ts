import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

const MAX_SESSION_SECONDS = 12 * 60 * 60;

/**
 * The Study Room's activity tracker reports the cumulative active seconds
 * of one study session (one page visit to one module). Upserted by
 * clientSessionId and only ever grows (max of stored vs reported), so a
 * retried or duplicated heartbeat — or a sendBeacon on tab close arriving
 * after a regular one — can never double-count or shrink the total.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // sendBeacon posts text/plain; request.json() parses the body regardless.
    const body = await request.json().catch(() => null);
    const { topicId, moduleId, clientSessionId, startedAt, seconds } = (body ?? {}) as Record<string, unknown>;

    if (typeof topicId !== 'string' || typeof clientSessionId !== 'string' || !clientSessionId || clientSessionId.length > 100) {
      return NextResponse.json({ error: 'topicId and clientSessionId are required' }, { status: 400 });
    }
    const secs = Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.round(Number(seconds) || 0)));
    const start = startedAt ? new Date(String(startedAt)) : new Date();
    if (Number.isNaN(start.getTime()) || start.getTime() > Date.now() + 60_000) {
      return NextResponse.json({ error: 'Invalid startedAt' }, { status: 400 });
    }

    const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const key = { userId_clientSessionId: { userId, clientSessionId } };
    const growExisting = async () => {
      const existing = await db.studyTimeEntry.findUnique({ where: key });
      if (!existing) return null;
      if (secs > existing.seconds) {
        await db.studyTimeEntry.update({ where: { id: existing.id }, data: { seconds: secs } });
      }
      return NextResponse.json({ id: existing.id, seconds: Math.max(secs, existing.seconds) });
    };
    const grown = await growExisting();
    if (grown) return grown;
    if (secs === 0) return NextResponse.json({ id: null, seconds: 0 }); // nothing worth a row yet

    try {
      const created = await db.studyTimeEntry.create({
        data: {
          userId,
          topicId,
          moduleId: typeof moduleId === 'string' && moduleId ? moduleId : null,
          startedAt: start,
          seconds: secs,
          source: 'auto',
          clientSessionId,
        },
      });
      return NextResponse.json({ id: created.id, seconds: created.seconds });
    } catch (e) {
      // Two heartbeats for a new session raced and the other created the
      // row first: treat this one as an update.
      if ((e as { code?: string }).code !== 'P2002') throw e;
      const after = await growExisting();
      if (after) return after;
      throw e;
    }
  } catch (e) {
    console.error('Time heartbeat failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
