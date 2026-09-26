import { db } from './db';

/** The other user's id for each accepted friendship of `userId`. */
export async function friendIds(userId: string): Promise<string[]> {
  const rows = await db.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await db.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

export const displayName = (u: { name: string | null; email: string | null }) =>
  u.name || u.email?.split('@')[0] || 'Learner';

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Minutes studied in the last 7 days, counting shared topics only. */
export async function sharedMinutesThisWeek(userId: string, now = Date.now()): Promise<number> {
  const sum = await db.studyTimeEntry.aggregate({
    where: { userId, startedAt: { gte: new Date(now - WEEK) }, topic: { shared: true, deletedAt: null } },
    _sum: { seconds: true },
  });
  return Math.round((sum._sum.seconds ?? 0) / 60);
}
