import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseTz, recentDoneAt, todayKey } from '@/lib/focusData';
import { isRhythm } from '@/lib/focusQueue';
import { localDateKey } from '@/lib/timeSummary';

type Params = { params: { id: string } };

/** Change a pin's rhythm or date, or record what happened to it today. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const item = await db.focusItem.findFirst({ where: { id: params.id, userId } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tz = parseTz(body.tz);
    const now = new Date();
    const today = todayKey(tz, now);
    const data: Parameters<typeof db.focusItem.update>[0]['data'] = {};

    switch (body.action) {
      case undefined: {
        if (body.rhythm !== undefined) {
          if (!isRhythm(body.rhythm)) return NextResponse.json({ error: 'Choose how often this should come up.' }, { status: 400 });
          data.rhythm = body.rhythm;
          if (body.rhythm !== 'by_date') data.targetDate = null;
        }
        if (typeof body.targetDate === 'string') {
          const date = new Date(body.targetDate);
          if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'That date isn’t valid.' }, { status: 400 });
          data.targetDate = date;
        }
        const rhythm = body.rhythm ?? item.rhythm;
        if (rhythm === 'by_date' && !(data.targetDate ?? item.targetDate)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
        break;
      }
      case 'done':
        data.doneAt = [...recentDoneAt(item.doneAt, now), now];
        if (item.rhythm === 'once') data.completedAt = now;
        break;
      case 'undo':
        data.doneAt = item.doneAt.filter((d) => localDateKey(d, tz) !== today);
        data.completedAt = null;
        break;
      case 'skip':
        data.skippedDay = today;
        if (item.addedDay === today) data.addedDay = null;
        break;
      case 'unskip':
        data.skippedDay = null;
        break;
      case 'add':
        data.addedDay = today;
        if (item.skippedDay === today) data.skippedDay = null;
        break;
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    await db.focusItem.update({ where: { id: item.id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to update Focus item:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Unpins it. The goal, topic or lesson itself is untouched. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await db.focusItem.deleteMany({ where: { id: params.id, userId: auth.userId } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to unpin:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
