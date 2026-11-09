import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { consume, tooManyRequests, HOUR } from '@/lib/rateLimit';
import { composeReminder, sendToDevices } from '@/lib/reminderData';

const TESTS_PER_HOUR = 5;

/** Sends one reminder now, so you can see that it arrives. */
export async function POST() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const limit = await consume(`push-test:${userId}`, TESTS_PER_HOUR, HOUR);
    if (limit.blocked) return tooManyRequests('That’s enough test reminders for now. Try again later.', limit);

    const devices = await db.pushSubscription.findMany({ where: { userId } });
    if (devices.length === 0) return NextResponse.json({ error: 'Turn the reminder on first.' }, { status: 400 });
    const message = (await composeReminder(db, userId, devices[0].tz)) ?? { title: 'Today’s list', body: 'Reminders are working. Nothing is due right now.' };
    const sent = await sendToDevices(db, devices, message);
    if (sent === 0) return NextResponse.json({ error: 'It couldn’t be delivered. Turn the reminder off and on again.' }, { status: 502 });
    return NextResponse.json({ sent });
  } catch (e) {
    console.error('Test reminder failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
