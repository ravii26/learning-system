import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { groupLessonNotes } from '@/lib/lessonNotes';

/** Everything you've written inside lessons, gathered by topic. */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const [modules, topics] = await Promise.all([
      db.curriculumItem.findMany({
        where: { userId, removed: false, notes: { not: '' }, topic: { deletedAt: null } },
        select: { topicId: true, legacyId: true, title: true, order: true, notes: true, updatedAt: true, topic: { select: { title: true } } },
      }),
      db.topic.findMany({
        where: { userId, deletedAt: null, AND: [{ notes: { not: null } }, { notes: { not: '' } }] },
        select: { id: true, title: true, notes: true, updatedAt: true },
      }),
    ]);
    const rows = modules.map((m) => ({
      topicId: m.topicId, topicTitle: m.topic.title, moduleId: m.legacyId, moduleTitle: m.title, order: m.order, notes: m.notes, updatedAt: m.updatedAt,
    }));
    return NextResponse.json({ groups: groupLessonNotes(rows, topics) });
  } catch (e) {
    console.error('Failed to load lesson notes:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
