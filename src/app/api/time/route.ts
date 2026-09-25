import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

const MAX_MANUAL_MINUTES = 12 * 60;

/** Time entries, newest first — optionally for one topic. */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get('topicId');
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50));

    const entries = await db.studyTimeEntry.findMany({
      where: { userId, ...(topicId ? { topicId } : {}), topic: { deletedAt: null } },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true, topicId: true, moduleId: true, startedAt: true, seconds: true, source: true, note: true,
        topic: { select: { title: true } },
      },
    });
    return NextResponse.json(entries);
  } catch (e) {
    console.error('Failed to list time entries:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Log time yourself: `manual` (e.g. you read the book offline) or `away`
 * (you confirmed time spent on a link the Study Room opened).
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json().catch(() => null);
    const { topicId, moduleId, minutes, startedAt, note, source } = (body ?? {}) as Record<string, unknown>;

    if (typeof topicId !== 'string') return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
    const mins = Math.round(Number(minutes));
    if (!Number.isFinite(mins) || mins < 1 || mins > MAX_MANUAL_MINUTES) {
      return NextResponse.json({ error: `minutes must be between 1 and ${MAX_MANUAL_MINUTES}` }, { status: 400 });
    }
    const start = startedAt ? new Date(String(startedAt)) : new Date(Date.now() - mins * 60_000);
    if (Number.isNaN(start.getTime()) || start.getTime() > Date.now() + 60_000) {
      return NextResponse.json({ error: 'startedAt must be a valid date, not in the future' }, { status: 400 });
    }

    const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const entry = await db.studyTimeEntry.create({
      data: {
        userId,
        topicId,
        moduleId: typeof moduleId === 'string' && moduleId ? moduleId : null,
        startedAt: start,
        seconds: mins * 60,
        source: source === 'away' ? 'away' : 'manual',
        note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null,
      },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error('Failed to log time:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
