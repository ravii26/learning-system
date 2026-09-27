import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { areFriends, displayName, sharedMinutesThisWeek } from '@/lib/friends';

/**
 * A friend's shared topics and goals, plus a this-week comparison.
 * Only accepted friends get anything, and only rows marked shared are
 * read. Notes, reviews and everything else stay private.
 */
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const friendId = params.userId;

  try {
    if (!(await areFriends(userId, friendId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [friend, topics, goals, theirMinutes, yourMinutes, yourCopies, yourGoalCopies] = await Promise.all([
      db.user.findUnique({ where: { id: friendId }, select: { name: true, email: true } }),
      db.topic.findMany({
        // Topics shared on their own, plus every topic in a shared goal.
        where: { userId: friendId, deletedAt: null, OR: [{ shared: true }, { goalLinks: { some: { goal: { shared: true } } } }] },
        select: {
          id: true, title: true, area: true, status: true, mode: true, depthTarget: true,
          progressPct: true, lastTouchedDate: true,
          curriculumItems: {
            where: { removed: false },
            select: { legacyId: true, title: true, order: true, completed: true, estimatedMinutes: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { lastTouchedDate: 'desc' },
      }),
      db.goal.findMany({
        where: { userId: friendId, shared: true },
        select: {
          id: true, title: true, outcome: true, status: true, targetDate: true,
          readinessMet: true, readinessTotal: true,
          links: {
            select: { order: true, topic: { select: { id: true, title: true, shared: true, deletedAt: true } } },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      sharedMinutesThisWeek(friendId),
      sharedMinutesThisWeek(userId),
      db.topic.findMany({
        where: { userId, deletedAt: null, copiedFromId: { not: null } },
        select: {
          id: true, copiedFromId: true, status: true,
          curriculumItems: { where: { removed: false }, select: { legacyId: true, completed: true } },
        },
      }),
      db.goal.findMany({ where: { userId, copiedFromId: { not: null } }, select: { id: true, copiedFromId: true } }),
    ]);
    if (!friend) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const copyOf = new Map(yourCopies.map((t) => [t.copiedFromId!, t]));
    const goalCopyOf = new Map(yourGoalCopies.map((g) => [g.copiedFromId!, g.id]));

    return NextResponse.json({
      friend: { id: friendId, name: displayName(friend) },
      week: { yourMinutes, theirMinutes },
      topics: topics.map(({ curriculumItems, ...t }) => ({
        ...t,
        modules: curriculumItems,
        // Your copy of this plan, if you took one: same module ids, your own
        // completion. Lets the page compare you module by module.
        yourCopy: copyOf.has(t.id)
          ? {
              id: copyOf.get(t.id)!.id,
              status: copyOf.get(t.id)!.status,
              completedModuleIds: copyOf.get(t.id)!.curriculumItems.filter((m) => m.completed).map((m) => m.legacyId),
            }
          : null,
      })),
      goals: goals.map(({ links, ...g }) => ({
        ...g,
        yourCopyId: goalCopyOf.get(g.id) ?? null,
        // Sharing a goal shares every topic in it.
        topics: links
          .filter((l) => l.topic && !l.topic.deletedAt)
          .map((l) => ({ title: l.topic!.title, sharedTopicId: l.topic!.id })),
      })),
    });
  } catch (e) {
    console.error('Failed to load friend progress:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
