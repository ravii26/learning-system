import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadFocus, parseTz, savePin, todayKey } from '@/lib/focusData';
import { localDateKey } from '@/lib/timeSummary';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const tz = parseTz(new URL(request.url).searchParams.get('tz'));
    const now = new Date();
    const today = todayKey(tz, now);
    const [items, user, dueCards, recentReviews] = await Promise.all([
      loadFocus(db, userId, tz, now),
      db.user.findUnique({ where: { id: userId }, select: { focusSetupAt: true } }),
      db.concept.count({
        where: {
          userId,
          suspended: false,
          masteryLevel: { not: 'Unknown' },
          OR: [{ nextReview: null }, { nextReview: { lte: now } }],
          topic: { status: { not: 'dropped' }, deletedAt: null },
        },
      }),
      db.reviewLog.findMany({ where: { userId, reviewedAt: { gte: new Date(now.getTime() - 36 * 3_600_000) } }, select: { reviewedAt: true } }),
    ]);
    const reviewedToday = recentReviews.some((r) => localDateKey(r.reviewedAt, tz) === today);
    return NextResponse.json({ items, setupDone: !!user?.focusSetupAt, dueCards, reviewedToday });
  } catch (e) {
    console.error('Failed to load Focus:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Nothing to pin.' }, { status: 400 });
    const result = await savePin(db, auth.userId, body, todayKey(parseTz(body.tz)));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ id: result.id });
  } catch (e) {
    console.error('Failed to pin to Focus:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
