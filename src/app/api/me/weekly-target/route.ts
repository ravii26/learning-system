import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/** Your own weekly study target, in hours. `null` removes it. */
export async function PUT(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = (await request.json().catch(() => ({}))) as { hours?: unknown };
  if (body.hours !== null && (typeof body.hours !== 'number' || !Number.isFinite(body.hours) || body.hours < 0.5 || body.hours > 80)) {
    return NextResponse.json({ error: 'Enter between 0.5 and 80 hours.' }, { status: 400 });
  }
  const weeklyTargetMinutes = body.hours === null ? null : Math.round((body.hours as number) * 60);
  await db.user.update({ where: { id: auth.userId }, data: { weeklyTargetMinutes } });
  return NextResponse.json({ weeklyTargetMinutes });
}
