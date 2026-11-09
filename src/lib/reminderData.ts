import webpush from 'web-push';
import type { PrismaClient } from '@prisma/client';
import { loadFocus } from './focusData';
import { pickToday } from './focusQueue';
import { reviewMinutes, typicalCardSeconds } from './pace';
import { reminderMessage, type ReminderMessage } from './reminders';

const RECENT_TIMED_CARDS = 50;
const GONE = new Set([404, 410]);

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject = process.env.VAPID_SUBJECT || (productionUrl ? `https://${productionUrl}` : null);
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Today's reminder for one person, or null when there's nothing to do. */
export async function composeReminder(db: PrismaClient, userId: string, tz: number, now: Date = new Date()): Promise<ReminderMessage | null> {
  const [cards, timed, focus] = await Promise.all([
    db.concept.count({
      where: {
        userId,
        suspended: false,
        masteryLevel: { not: 'Unknown' },
        OR: [{ nextReview: null }, { nextReview: { lte: now } }],
        topic: { status: { not: 'dropped' }, deletedAt: null },
      },
    }),
    db.reviewLog.findMany({ where: { userId, durationMs: { not: null } }, orderBy: { reviewedAt: 'desc' }, take: RECENT_TIMED_CARDS, select: { durationMs: true } }),
    loadFocus(db, userId, tz, now),
  ]);
  const first = pickToday(focus, 'normal').list[0];
  return reminderMessage({
    cards,
    minutes: reviewMinutes(cards, typicalCardSeconds(timed.map((t) => t.durationMs as number))),
    next: first ? first.nextStep ?? first.title : null,
  });
}

export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends to each device and forgets any the browser says no longer exist. */
export async function sendToDevices(db: PrismaClient, devices: PushTarget[], message: ReminderMessage): Promise<number> {
  const config = pushConfig();
  if (!config) return 0;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const payload = JSON.stringify({ ...message, url: '/' });
  let sent = 0;
  for (const device of devices) {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload);
      sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status && GONE.has(status)) await db.pushSubscription.deleteMany({ where: { id: device.id } });
      else console.error('Push failed:', status ?? e);
    }
  }
  return sent;
}
