import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { asChecklist, cleanChecklistDrafts, cleanSection, mergeChecklist } from '@/lib/lessonAssist';

type Params = { params: { id: string; moduleId: string } };

/** What you've added to this lesson. Stored apart from it, so a rewrite can't erase any of it. */
export async function GET(_request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const additions = await db.lessonAddition.findMany({
      where: { userId: auth.userId, topicId: params.id, moduleId: params.moduleId },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ additions });
  } catch (e) {
    console.error('Failed to load lesson additions:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const lessonRow = await db.curriculumItem.findFirst({
      where: { userId, topicId: params.id, legacyId: params.moduleId, removed: false, topic: { deletedAt: null } },
      select: { id: true },
    });
    if (!lessonRow) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const keys = { userId, topicId: params.id, moduleId: params.moduleId };

    if (body.type === 'section') {
      const section = cleanSection(body);
      if (!section) return NextResponse.json({ error: 'There’s nothing to add.' }, { status: 400 });
      const addition = await db.lessonAddition.create({ data: { ...keys, type: 'section', ...section } });
      return NextResponse.json({ addition });
    }

    if (body.type === 'practice') {
      const drafts = cleanChecklistDrafts(body.items);
      if (drafts.length === 0) return NextResponse.json({ error: 'Choose at least one problem.' }, { status: 400 });
      // One checklist per lesson: new problems join the existing one.
      const existing = await db.lessonAddition.findFirst({ where: { ...keys, type: 'practice' } });
      const items = mergeChecklist(asChecklist(existing?.items), drafts, { suggested: body.suggested === true, newId: randomUUID });
      const data = { items: items as unknown as Prisma.InputJsonValue };
      const addition = existing
        ? await db.lessonAddition.update({ where: { id: existing.id }, data })
        : await db.lessonAddition.create({ data: { ...keys, type: 'practice', heading: 'Practice problems', ...data } });
      return NextResponse.json({ addition });
    }

    return NextResponse.json({ error: 'Unknown kind of addition.' }, { status: 400 });
  } catch (e) {
    console.error('Failed to save lesson addition:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
