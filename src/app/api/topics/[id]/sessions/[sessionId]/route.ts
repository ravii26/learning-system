import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { RATINGS, RATING_SCORE, type SessionRating } from '@/lib/program/sessions';

/**
 * Finish or skip a day. Finishing records a practice rep (so the plan's
 * readiness counts it) and keeps the rating, note and checked answers,
 * which steer the next days.
 */
export async function PATCH(request: Request, { params }: { params: { id: string; sessionId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const session = await db.practiceSession.findFirst({ where: { id: params.sessionId, topicId: params.id, userId } });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = b.status === 'done' || b.status === 'skipped' || b.status === 'pending' ? b.status : null;
  if (!status) return NextResponse.json({ error: 'status must be done, skipped or pending' }, { status: 400 });
  const rating: SessionRating | null = (RATINGS as readonly string[]).includes(b.rating as string) ? (b.rating as SessionRating) : null;
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 1000) : null;
  const results = b.results && typeof b.results === 'object' ? JSON.parse(JSON.stringify(b.results).slice(0, 50_000)) : null;
  const firstTimeDone = status === 'done' && session.status !== 'done';

  const updated = await db.$transaction(async (tx) => {
    const s = await tx.practiceSession.update({
      where: { id: session.id },
      data: {
        status,
        rating: status === 'done' ? rating : null,
        notes: notes || null,
        ...(results ? { results } : {}),
        completedAt: status === 'done' ? session.completedAt ?? new Date() : null,
      },
    });
    if (firstTimeDone) {
      await tx.practiceRep.create({
        data: {
          userId, topicId: params.id,
          promptText: `Day ${session.day}: ${session.title}`.slice(0, 500),
          rubricScores: {}, invertedKeys: [],
          score: RATING_SCORE[rating ?? 'right'],
          durationSeconds: session.minutes * 60,
        },
      });
      await tx.topic.update({ where: { id: params.id }, data: { lastTouchedDate: new Date() } });
    }
    return s;
  });
  return NextResponse.json(updated);
}
