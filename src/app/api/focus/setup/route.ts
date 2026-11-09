import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseTz, savePin, todayKey } from '@/lib/focusData';

const MAX_PINS = 100;

/** Finishes first-time setup. An empty list is a skip: it changes nothing else. */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => null)) as { pins?: unknown; tz?: unknown } | null;
    const pins = Array.isArray(body?.pins) ? body.pins : [];
    if (pins.length > MAX_PINS) return NextResponse.json({ error: 'That is too many at once.' }, { status: 400 });
    const today = todayKey(parseTz(body?.tz));

    const failure = await db.$transaction(async (tx) => {
      for (const pin of pins) {
        const result = await savePin(tx, userId, pin as Record<string, unknown>, today);
        if (!result.ok) return result;
      }
      await tx.user.update({ where: { id: userId }, data: { focusSetupAt: new Date() } });
      return null;
    }, { timeout: 20_000 });

    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to save Focus setup:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
