import { NextResponse } from 'next/server';
import type { GoalStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { recomputeGoalReadiness } from '@/lib/goalReadinessRecompute';

const VALID_STATUSES: GoalStatus[] = ['draft', 'active', 'achieved', 'abandoned', 'paused'];

/**
 * Goal detail: the roadmap as a dependency-ordered path (links, ordered),
 * with readiness recomputed live — cheap enough (one query over this
 * goal's own links, no subtree traversal) that a cache would only risk
 * going stale for no real benefit. See src/lib/goalReadiness.ts for what
 * "readiness" means here.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const goal = await db.goal.findFirst({
      where: { id: params.id, userId },
      include: { links: { include: { topic: true, skill: true }, orderBy: { order: 'asc' } } },
    });
    if (!goal) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const readiness = await recomputeGoalReadiness(db, userId, goal.id);

    return NextResponse.json({ ...goal, readiness });
  } catch (e) {
    console.error('Failed to get goal:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Status changes only — title/outcome/roadmap content are set once at creation. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const existing = await db.goal.findFirst({ where: { id: params.id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const body = await request.json();
    const { status, targetDate } = body as { status?: GoalStatus; targetDate?: string | null };

    if (status !== undefined && !VALID_STATUSES.includes(status as GoalStatus)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
    }

    const data: { status?: GoalStatus; achievedAt?: Date | null; targetDate?: Date | null } = {};
    if (status !== undefined) {
      data.status = status;
      data.achievedAt = status === 'achieved' ? new Date() : existing.achievedAt;
    }
    if (targetDate !== undefined) {
      data.targetDate = targetDate ? new Date(targetDate) : null;
    }

    const updated = await db.goal.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to update goal:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // deleteMany, not delete — see the same reasoning on Topic's DELETE
    // route: `delete` needs a unique where (id alone), which would let a
    // request delete another user's goal by id.
    const result = await db.goal.deleteMany({ where: { id: params.id, userId } });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    // GoalLink rows cascade; the Topics themselves are untouched — deleting
    // a goal is not the same as abandoning the topics that served it.
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete goal:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
