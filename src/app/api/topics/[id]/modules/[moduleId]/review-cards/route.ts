import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { buildModuleReviewCards } from '@/lib/reviewCards';
import { addReviewCards } from '@/lib/reviewCardPersist';

/**
 * Called when a module is marked complete: turns its saved lesson into
 * Daily Review cards (see src/lib/reviewCards.ts for which parts). Safe to
 * call repeatedly — cards already on the topic are skipped.
 */
export async function POST(_request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const [lesson, module] = await Promise.all([
      db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId } }),
      db.curriculumItem.findFirst({ where: { topicId: params.id, legacyId: params.moduleId, removed: false }, select: { title: true } }),
    ]);
    if (!lesson) {
      // Nothing studied yet (no lesson was ever opened) — not an error.
      return NextResponse.json({ added: 0, skipped: 0, reason: 'no saved lesson for this module' });
    }

    const drafts = buildModuleReviewCards(lesson.content, module?.title || lesson.moduleTitle);
    const result = await db.$transaction((tx) => addReviewCards(tx, userId, params.id, params.moduleId, drafts, { dueInDays: 2 }));
    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to create review cards:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
