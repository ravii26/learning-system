import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

function checkAuth() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET() {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const topics = await db.topic.findMany();

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

    // Get the most recent review log
    const lastReview = await db.reviewLog.findFirst({
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
