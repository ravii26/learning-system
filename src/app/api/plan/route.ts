import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadFocus, parseTz, todayKey } from '@/lib/focusData';
import { isUnresolved, weekDays } from '@/lib/weekPlan';

const MAX_CELLS = 200;

/** Saves your plan for the rest of this week. Days already past are left as history. */
export async function PUT(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { cells?: unknown; tz?: unknown };
    if (!Array.isArray(body.cells) || body.cells.length > MAX_CELLS) return NextResponse.json({ error: 'That plan couldn’t be read.' }, { status: 400 });

    const tz = parseTz(body.tz);
    const today = todayKey(tz);
    const editable = weekDays(today).filter((d) => d >= today);
    const cells = (body.cells as Array<{ focusItemId?: unknown; day?: unknown }>).flatMap((c) =>
      typeof c.focusItemId === 'string' && typeof c.day === 'string' && editable.includes(c.day) ? [{ focusItemId: c.focusItemId, day: c.day }] : []);

    const owned = new Set((await db.focusItem.findMany({ where: { userId, id: { in: cells.map((c) => c.focusItemId) } }, select: { id: true } })).map((i) => i.id));
    if (cells.some((c) => !owned.has(c.focusItemId))) return NextResponse.json({ error: 'That item couldn’t be found.' }, { status: 404 });

    // Whatever was still waiting from earlier has now been planned, or chosen against.
    const [items, past] = await Promise.all([
      loadFocus(db, userId, tz),
      db.planEntry.findMany({ where: { userId, day: { lt: today } }, select: { id: true, focusItemId: true, day: true, position: true } }),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const settled = past.filter((e) => isUnresolved(e, byId.get(e.focusItemId), today)).map((e) => e.id);

    const positions = new Map<string, number>();
    const data = cells.map((c) => {
      const position = positions.get(c.day) ?? 0;
      positions.set(c.day, position + 1);
      return { ...c, userId, position };
    });

    await db.$transaction([
      db.planEntry.deleteMany({ where: { userId, OR: [{ day: { in: editable } }, { id: { in: settled } }] } }),
      db.planEntry.createMany({ data, skipDuplicates: true }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to save the week plan:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
