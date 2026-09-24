import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { pickNoteToResurface } from '@/lib/noteResurface';

/** The one note to show back to you today, or { note: null }. See src/lib/noteResurface.ts for the rule. */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const notes = await db.note.findMany({
      where: { userId },
      select: { id: true, title: true, createdAt: true, updatedAt: true, lastResurfacedAt: true },
    });
    const pick = pickNoteToResurface(notes);
    if (!pick) return NextResponse.json({ note: null });

    const note = await db.note.findFirst({
      where: { id: pick.id, userId },
      select: { id: true, title: true, body: true, tags: true, createdAt: true, resurfaceCount: true, topic: { select: { id: true, title: true } } },
    });
    return NextResponse.json({ note });
  } catch (e) {
    console.error('Failed to pick a note to resurface:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
