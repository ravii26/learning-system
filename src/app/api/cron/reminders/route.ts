import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { todayKey } from '@/lib/focusData';
import { composeReminder, pushConfig, sendToDevices, type PushTarget } from '@/lib/reminderData';

export const maxDuration = 60;

const hash = (s: string) => createHash('sha256').update(s).digest();

/**
 * Sends today's reminder to everyone who turned it on. Vercel Cron calls this
 * once a day (vercel.json) with CRON_SECRET; without that secret it's closed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const given = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(hash(given), hash(`Bearer ${secret}`))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!pushConfig()) return NextResponse.json({ error: 'Reminders are not configured.' }, { status: 503 });

  try {
    const devices = await db.pushSubscription.findMany();
    const byUser = new Map<string, Array<PushTarget & { tz: number }>>();
    for (const d of devices) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);

    const users = await db.user.findMany({ where: { id: { in: Array.from(byUser.keys()) } }, select: { id: true, reminderSentDay: true } });
    let sent = 0;
    let skipped = 0;
    for (const user of users) {
      const own = byUser.get(user.id) ?? [];
      const today = todayKey(own[0].tz);
      if (user.reminderSentDay === today) { skipped += 1; continue; } // a retried run
      try {
        const message = await composeReminder(db, user.id, own[0].tz);
        if (!message) { skipped += 1; continue; } // nothing to do today, so no nudge
        if ((await sendToDevices(db, own, message)) > 0) {
          await db.user.update({ where: { id: user.id }, data: { reminderSentDay: today } });
          sent += 1;
        }
      } catch (e) {
        console.error('Reminder failed for one person:', e); // the others still go out
      }
    }
    return NextResponse.json({ sent, skipped });
  } catch (e) {
    console.error('Reminder job failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
