import { NextResponse } from 'next/server';
import type { MasteryLevel, FsrsState } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { mirrorConceptsToJson } from '@/lib/conceptSync';

interface Snapshot {
  state: FsrsState;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: string | null;
  nextReview: string | null;
  masteryLevel: MasteryLevel;
  seededFromLegacy: boolean;
}

/** Puts a card back exactly as it was before its latest review. */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { reviewLogId?: unknown };
    if (typeof body.reviewLogId !== 'string') return NextResponse.json({ error: 'Nothing to undo.' }, { status: 400 });

    const log = await db.reviewLog.findFirst({ where: { id: body.reviewLogId, userId }, include: { concept: { select: { topicId: true } } } });
    if (!log) return NextResponse.json({ error: 'Nothing to undo.' }, { status: 404 });
    if (!log.previous) return NextResponse.json({ error: 'That review can’t be undone.' }, { status: 409 });

    const newer = await db.reviewLog.findFirst({ where: { conceptId: log.conceptId, userId, reviewedAt: { gt: log.reviewedAt } }, select: { id: true } });
    if (newer) return NextResponse.json({ error: 'Only the latest review of a card can be undone.' }, { status: 409 });

    const p = log.previous as unknown as Snapshot;
    await db.$transaction(async (tx) => {
      await tx.concept.update({
        where: { id: log.conceptId },
        data: {
          state: p.state,
          stability: p.stability,
          difficulty: p.difficulty,
          reps: p.reps,
          lapses: p.lapses,
          elapsedDays: p.elapsedDays,
          scheduledDays: p.scheduledDays,
          lastReview: p.lastReview ? new Date(p.lastReview) : null,
          nextReview: p.nextReview ? new Date(p.nextReview) : null,
          masteryLevel: p.masteryLevel,
          seededFromLegacy: p.seededFromLegacy,
        },
      });
      await tx.reviewLog.delete({ where: { id: log.id } });
      const mirror = await mirrorConceptsToJson(tx, log.concept.topicId);
      await tx.topic.update({ where: { id: log.concept.topicId }, data: { knowledgeMap: mirror as object } });
    });
    return NextResponse.json({ conceptId: log.conceptId });
  } catch (e) {
    console.error('Failed to undo review:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
