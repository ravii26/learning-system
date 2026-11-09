import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadFocus, parseTz, savePin, todayKey } from '@/lib/focusData';
import { localDateKey } from '@/lib/timeSummary';
import { addDays, weekDays } from '@/lib/weekPlan';

const PLAN_HISTORY_DAYS = 14;

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const tz = parseTz(new URL(request.url).searchParams.get('tz'));
    const now = new Date();
    const today = todayKey(tz, now);
    const [items, user, dueCards, recentReviews, entries] = await Promise.all([
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
      db.planEntry.findMany({ where: { userId, day: { gte: addDays(today, -PLAN_HISTORY_DAYS) } }, select: { focusItemId: true, day: true, position: true } }),
    ]);
    const plan = { today, days: weekDays(today), entries };
    const reviewedToday = recentReviews.some((r) => localDateKey(r.reviewedAt, tz) === today);
    return NextResponse.json({ items, setupDone: !!user?.focusSetupAt, dueCards, reviewedToday, plan });
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
