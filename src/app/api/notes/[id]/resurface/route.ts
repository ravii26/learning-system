import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/** Marks a resurfaced note as seen, so it isn't shown again for a while. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.note.updateMany({
      where: { id: params.id, userId },
      data: { lastResurfacedAt: new Date(), resurfaceCount: { increment: 1 } },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to mark note resurfaced:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
