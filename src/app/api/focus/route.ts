import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadFocus, parseTz, savePin, todayKey } from '@/lib/focusData';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const tz = parseTz(new URL(request.url).searchParams.get('tz'));
    const [items, user] = await Promise.all([
      loadFocus(db, userId, tz),
      db.user.findUnique({ where: { id: userId }, select: { focusSetupAt: true } }),
    ]);
    return NextResponse.json({ items, setupDone: !!user?.focusSetupAt });
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
