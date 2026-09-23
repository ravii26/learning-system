import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { syncNoteLinksFromBody } from '@/lib/noteLinkSync';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');

    const where: Record<string, unknown> = { userId };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tag) {
      where.tags = { has: tag };
    }

    const notes = await db.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { incoming: true, outgoing: true } } },
    });

    return NextResponse.json(notes);
  } catch (e) {
    console.error('Failed to list notes:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { title, body: noteBody, kind, tags, topicId, conceptId, skillId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const note = await db.note.create({
      data: {
        userId,
        title: title.trim(),
        body: noteBody || '',
        kind: kind || 'permanent',
        tags: Array.isArray(tags) ? tags : [],
        topicId: topicId || null,
        conceptId: conceptId || null,
        skillId: skillId || null,
      },
    });

    if (note.body) {
      await syncNoteLinksFromBody(db, userId, note.id, note.body);
    }

    return NextResponse.json(note);
  } catch (e) {
    console.error('Failed to create note:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
