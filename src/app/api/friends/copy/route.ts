import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { areFriends } from '@/lib/friends';
import { copyTopicPlan, type SourceTopic } from '@/lib/planCopy';

const sourceSelect = {
  id: true, userId: true, title: true, area: true, mode: true, topicMode: true, depthTarget: true,
  rubricTemplate: true, shared: true, deletedAt: true,
  curriculumItems: { where: { removed: false }, select: { legacyId: true, order: true, title: true, estimatedMinutes: true } },
  resourceRows: { where: { removed: false }, select: { title: true, type: true, url: true, purpose: true }, orderBy: { order: 'asc' as const } },
} as const;

type SourceRow = {
  id: string; title: string; area: string; mode: string; topicMode: string | null; depthTarget: string | null;
  rubricTemplate: string | null; shared: boolean;
  curriculumItems: SourceTopic['modules']; resourceRows: SourceTopic['resources'];
};

const toSource = (t: SourceRow): SourceTopic => ({
  id: t.id, title: t.title, area: t.area, mode: t.mode, topicMode: t.topicMode, depthTarget: t.depthTarget,
  rubricTemplate: t.rubricTemplate, modules: t.curriculumItems, resources: t.resourceRows,
});

// A goal's unshared topics come across as a title only: the friend chose
// not to share that topic's plan, and its title is already visible on the
// shared goal.
const titleOnly = (t: { id: string; title: string }): SourceTopic => ({
  id: t.id, title: t.title, area: 'Other', mode: 'syllabus', topicMode: null, depthTarget: null,
  rubricTemplate: null, modules: [], resources: [],
});

/** Copies a friend's shared topic, or a shared goal with its topics, into your learning. */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { kind, id } = (await request.json().catch(() => ({}))) as { kind?: string; id?: unknown };
    if ((kind !== 'topic' && kind !== 'goal') || typeof id !== 'string') {
      return NextResponse.json({ error: 'kind (topic|goal) and id are required' }, { status: 400 });
    }
    const notFound = NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (kind === 'topic') {
      const source = await db.topic.findFirst({ where: { id, shared: true, deletedAt: null }, select: sourceSelect });
      if (!source || !(await areFriends(userId, source.userId))) return notFound;
      const result = await db.$transaction((tx) => copyTopicPlan(tx, userId, toSource(source)));
      return NextResponse.json({ topicId: result.id, created: result.created });
    }

    const goal = await db.goal.findFirst({
      where: { id, shared: true },
      select: {
        id: true, userId: true, title: true, outcome: true, targetDate: true,
        links: { where: { topicId: { not: null } }, orderBy: { order: 'asc' }, select: { order: true, required: true, topic: { select: sourceSelect } } },
      },
    });
    if (!goal || !(await areFriends(userId, goal.userId))) return notFound;

    const existing = await db.goal.findFirst({ where: { userId, copiedFromId: goal.id }, select: { id: true } });
    if (existing) return NextResponse.json({ goalId: existing.id, created: false });

    const goalId = await db.$transaction(async (tx) => {
      const mine = await tx.goal.create({
        data: { userId, title: goal.title, outcome: goal.outcome, status: 'active', startedAt: new Date(), copiedFromId: goal.id },
      });
      for (const link of goal.links) {
        const t = link.topic;
        if (!t || t.deletedAt) continue;
        const copy = await copyTopicPlan(tx, userId, t.shared ? toSource(t) : titleOnly(t));
        await tx.goalLink.create({
          data: { userId, goalId: mine.id, topicId: copy.id, order: link.order, required: link.required },
        });
      }
      return mine.id;
    }, { timeout: 30_000 });
    return NextResponse.json({ goalId, created: true });
  } catch (e) {
    console.error('Failed to copy plan:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
