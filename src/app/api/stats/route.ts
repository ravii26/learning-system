import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topics = await db.topic.findMany({ where: { userId } });

    const counts = {
      inbox: 0,
      queued: 0,
      active: 0,
      paused: 0,
      maintenance: 0,
      reference: 0,
      dropped: 0,
    };

    let staleActiveCount = 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const t of topics) {
      const statusKey = t.status as keyof typeof counts;
      if (statusKey in counts) {
        counts[statusKey]++;
      }
      // Check if active topic has been untouched for > 7 days
      if (t.status === 'active' && t.lastTouchedDate < sevenDaysAgo) {
        staleActiveCount++;
      }
    }

    // Get the most recent weekly-audit review session. ReviewSession is the
    // renamed ReviewLog (see the Phase 3 migration) — db.reviewLog now
    // means per-concept spaced-review events, a different thing.
    const lastReview = await db.reviewSession.findFirst({
      where: { userId },
      orderBy: { reviewedAt: 'desc' },
    });

    let daysSinceLastReview = null;
    if (lastReview) {
      const diffTime = Math.abs(new Date().getTime() - lastReview.reviewedAt.getTime());
      daysSinceLastReview = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      counts,
      staleActiveCount,
      lastReviewDate: lastReview ? lastReview.reviewedAt : null,
      daysSinceLastReview,
    });
  } catch (e) {
    console.error('Failed to compile stats:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
