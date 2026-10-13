import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { buildOverview } from '@/lib/lessonOverview';

/**
 * Every lesson across every topic, with its kind and whether it has been
 * written. Read-only. Deleted topics and removed lessons are left out.
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const items = await db.curriculumItem.findMany({
      where: { userId, removed: false, topic: { deletedAt: null } },
      orderBy: [{ topic: { updatedAt: 'desc' } }, { order: 'asc' }],
      take: 2000,
      select: {
        topicId: true, legacyId: true, title: true, order: true, kind: true, blueprint: true, completed: true, estimatedMinutes: true,
        topic: { select: { title: true, status: true, mode: true } },
      },
    });
    const saved = await db.generatedLesson.findMany({
      where: { userId, topic: { deletedAt: null } },
      select: { topicId: true, moduleId: true, content: true },
      take: 2000,
    });

    const rows = buildOverview(
      items.map((i) => ({
        topicId: i.topicId,
        topicTitle: i.topic.title,
        topicStatus: i.topic.status,
        topicMode: i.topic.mode,
        legacyId: i.legacyId,
        title: i.title,
        order: i.order,
        kind: i.kind,
        blueprint: i.blueprint,
        completed: i.completed,
        estimatedMinutes: i.estimatedMinutes,
      })),
      saved,
    );
    return NextResponse.json({ rows });
  } catch (e) {
    console.error('Failed to load the lesson overview:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
