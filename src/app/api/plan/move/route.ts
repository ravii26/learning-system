import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseTz, todayKey } from '@/lib/focusData';
import { addDays } from '@/lib/weekPlan';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FURTHEST_DAYS = 14;

/**
 * Moves something to another day, or off the plan with "later". Without
 * `from` it leaves today, including anything rolled forward from earlier.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { focusItemId?: unknown; to?: unknown; from?: unknown; tz?: unknown };
    if (typeof body.focusItemId !== 'string') return NextResponse.json({ error: 'Nothing to move.' }, { status: 400 });
    const item = await db.focusItem.findFirst({ where: { id: body.focusItemId, userId }, select: { id: true, skippedDay: true } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const today = todayKey(parseTz(body.tz));
    const from = typeof body.from === 'string' && DAY.test(body.from) ? body.from : null;
    const to = body.to;
    if (to !== 'later' && !(typeof to === 'string' && DAY.test(to) && to >= today && to <= addDays(today, FURTHEST_DAYS))) {
      return NextResponse.json({ error: 'Pick a day from today onwards.' }, { status: 400 });
    }

    const leavingToday = !from || from === today;
    await db.$transaction(async (tx) => {
      await tx.planEntry.deleteMany({ where: { userId, focusItemId: item.id, day: from ? from : { lte: today } } });
      if (to !== 'later') {
        const last = await tx.planEntry.aggregate({ where: { userId, day: to as string }, _max: { position: true } });
        await tx.planEntry.upsert({
          where: { focusItemId_day: { focusItemId: item.id, day: to as string } },
          create: { userId, focusItemId: item.id, day: to as string, position: (last._max.position ?? -1) + 1 },
          update: {},
        });
      }
      // Skipping also covers a day that's only a suggestion, with no plan behind it.
      if (to === today) await tx.focusItem.update({ where: { id: item.id }, data: { addedDay: today, skippedDay: null } });
      else if (leavingToday) await tx.focusItem.update({ where: { id: item.id }, data: { skippedDay: today, addedDay: null } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to move a plan item:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
