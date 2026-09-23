import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { syncNoteLinksFromBody } from '@/lib/noteLinkSync';

/**
 * Note detail, including backlinks — every note that links TO this one.
 * Read bidirectionally from the single-row-per-link NoteLink table (see
 * its schema comment): this note's own `incoming` relation already is the
 * backlinks list, no separate query needed.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const note = await db.note.findFirst({
      where: { id: params.id, userId },
      include: {
        outgoing: { include: { to: { select: { id: true, title: true } } } },
        incoming: { include: { from: { select: { id: true, title: true } } } },
        topic: { select: { id: true, title: true } },
        concept: { select: { id: true, title: true } },
        skill: { select: { id: true, name: true } },
      },
    });
    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    return NextResponse.json(note);
  } catch (e) {
    console.error('Failed to get note:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const existing = await db.note.findFirst({ where: { id: params.id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.body !== undefined) data.body = body.body;
    if (body.kind !== undefined) data.kind = body.kind;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.topicId !== undefined) data.topicId = body.topicId;
    if (body.conceptId !== undefined) data.conceptId = body.conceptId;
    if (body.skillId !== undefined) data.skillId = body.skillId;

    const updated = await db.note.update({ where: { id: params.id }, data });

    // Re-parse wikilinks whenever the body changed — including to "",
    // which must clear any links a shrunk-to-empty body no longer makes.
    if (body.body !== undefined) {
      await syncNoteLinksFromBody(db, userId, params.id, updated.body);
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error('Failed to update note:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.note.deleteMany({ where: { id: params.id, userId } });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete note:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
