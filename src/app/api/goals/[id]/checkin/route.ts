import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import type { CompetencyMap } from '@/data/competencies';
import { checkinDueAt, createCheckin, toView } from '@/lib/program/checkinServer';

/** Check-in state for a goal: when the next one is due, and any proposal waiting for a decision. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const dueAt = await checkinDueAt(db, userId, params.id);
    if (!dueAt) return NextResponse.json({ error: 'No program for this goal' }, { status: 404 });
    const [pending, program] = await Promise.all([
      db.weeklyCheckin.findFirst({ where: { userId, goalId: params.id, status: 'proposed' }, orderBy: { createdAt: 'desc' } }),
      db.program.findFirst({ where: { userId, goalId: params.id, status: 'active' }, select: { competencyMap: true } }),
    ]);
    return NextResponse.json({
      dueAt,
      due: Date.now() >= dueAt.getTime(),
      pending: pending && program ? toView(pending, program.competencyMap as unknown as CompetencyMap) : null,
    });
  } catch (e) {
    console.error('Failed to load check-in state:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Runs this week's check-in if it's due. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await createCheckin(db, userId, params.id);
    if ('error' in result) {
      if (result.error === 'not_due') return NextResponse.json({ error: 'Your next check-in is not due yet.', dueAt: result.dueAt }, { status: 409 });
      return NextResponse.json({ error: 'No program for this goal' }, { status: 404 });
    }
    return NextResponse.json(result.checkin, { status: 201 });
  } catch (e) {
    console.error('Failed to run check-in:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
