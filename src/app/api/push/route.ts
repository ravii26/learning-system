import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseTz } from '@/lib/focusData';
import { pushConfig } from '@/lib/reminderData';
import { isPushEndpoint } from '@/lib/reminders';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const config = pushConfig();
  return NextResponse.json({ enabled: !!config, publicKey: config?.publicKey ?? null });
}

/** Turns the daily reminder on for this device. */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; tz?: unknown };
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const authKey = body.subscription?.keys?.auth;
    if (!isPushEndpoint(endpoint) || typeof p256dh !== 'string' || typeof authKey !== 'string') {
      return NextResponse.json({ error: 'This browser’s reminder details weren’t accepted.' }, { status: 400 });
    }
    const data = { userId, p256dh, auth: authKey, tz: parseTz(body.tz) };
    await db.pushSubscription.upsert({ where: { endpoint }, create: { ...data, endpoint }, update: data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to turn on reminders:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Turns it off for this device. */
export async function DELETE(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
    if (typeof body.endpoint !== 'string') return NextResponse.json({ error: 'Nothing to turn off.' }, { status: 400 });
    await db.pushSubscription.deleteMany({ where: { userId: auth.userId, endpoint: body.endpoint } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Failed to turn off reminders:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
