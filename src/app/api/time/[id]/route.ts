import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/** Correct a time entry: its length, date, or note. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json().catch(() => null);
    const { minutes, startedAt, note } = (body ?? {}) as Record<string, unknown>;
    const data: { seconds?: number; startedAt?: Date; note?: string | null; clientSessionId?: null } = {};

    if (minutes !== undefined) {
      const mins = Math.round(Number(minutes));
      if (!Number.isFinite(mins) || mins < 1 || mins > 720) {
        return NextResponse.json({ error: 'minutes must be between 1 and 720' }, { status: 400 });
      }
      data.seconds = mins * 60;
      // An edited auto span is detached from its tracker session, so a late
      // heartbeat can't overwrite your correction.
      data.clientSessionId = null;
    }
    if (startedAt !== undefined) {
      const d = new Date(String(startedAt));
      if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 60_000) {
        return NextResponse.json({ error: 'startedAt must be a valid date, not in the future' }, { status: 400 });
      }
      data.startedAt = d;
    }
    if (note !== undefined) data.note = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;

    const result = await db.studyTimeEntry.updateMany({ where: { id: params.id, userId }, data });
    if (result.count === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json(await db.studyTimeEntry.findUnique({ where: { id: params.id } }));
  } catch (e) {
    console.error('Failed to update time entry:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.studyTimeEntry.deleteMany({ where: { id: params.id, userId } });
    if (result.count === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete time entry:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
