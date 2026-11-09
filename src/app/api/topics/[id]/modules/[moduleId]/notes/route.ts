import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { mirrorCurriculumToJson } from '@/lib/curriculumSync';
import { MAX_QUOTE_LENGTH, appendToNotes, cleanSelectedText, quoteToHtml } from '@/lib/noteQuote';

const MAX_NOTES = 50_000;

/**
 * Adds text selected in the lesson to the end of this module's notes. The
 * append happens here, against the stored notes, so a page holding an older
 * copy can't overwrite writing saved from somewhere else.
 */
export async function POST(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json().catch(() => null);
    const quote = typeof body?.quote === 'string' ? cleanSelectedText(body.quote) : '';
    if (!quote) return NextResponse.json({ error: 'Select some text first.' }, { status: 400 });
    if (quote.length > MAX_QUOTE_LENGTH) return NextResponse.json({ error: 'That selection is too long. Select a shorter passage.' }, { status: 400 });

    const added = quoteToHtml(quote);
    const result = await db.$transaction(async (tx) => {
      const item = await tx.curriculumItem.findFirst({
        where: { userId, topicId: params.id, legacyId: params.moduleId, removed: false, topic: { deletedAt: null } },
        select: { id: true, notes: true },
      });
      if (!item) return { status: 'missing' as const };
      const notes = appendToNotes(item.notes ?? '', added);
      if (notes.length > MAX_NOTES) return { status: 'full' as const };
      await tx.curriculumItem.update({ where: { id: item.id }, data: { notes } });
      const mirror = await mirrorCurriculumToJson(tx, params.id);
      await tx.topic.update({ where: { id: params.id }, data: { curriculum: mirror as object } });
      return { status: 'saved' as const, notes };
    });

    if (result.status === 'missing') return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    if (result.status === 'full') return NextResponse.json({ error: 'The notes for this lesson are full.' }, { status: 400 });
    return NextResponse.json({ notes: result.notes, added });
  } catch (e) {
    console.error('Failed to add to module notes:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Your notes on one module. The only writer of CurriculumItem.notes after
 * the module is created (see syncCurriculumFromJson), so a syllabus save
 * from a stale page can't overwrite them. They come back beside this
 * module's review cards in Daily Review.
 */
export async function PUT(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json().catch(() => null);
    const notes = body?.notes;
    if (typeof notes !== 'string') return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
    if (notes.length > MAX_NOTES) return NextResponse.json({ error: 'Notes are too long for one module' }, { status: 400 });

    const saved = await db.$transaction(async (tx) => {
      const result = await tx.curriculumItem.updateMany({
        where: { userId, topicId: params.id, legacyId: params.moduleId, removed: false, topic: { deletedAt: null } },
        data: { notes },
      });
      if (result.count === 0) return false;
      const mirror = await mirrorCurriculumToJson(tx, params.id);
      await tx.topic.update({ where: { id: params.id }, data: { curriculum: mirror as object } });
      return true;
    });

    if (!saved) return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to save module notes:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
