import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/**
 * Undoes a DELETE /api/topics/[id] (which soft-deletes — see that route's
 * comment). Clearing deletedAt is the only thing this does: everything
 * that cascaded off the topic (Concept, ReviewLog, SessionLog, etc.) was
 * never touched, so a restore brings back the whole topic exactly as it
 * was, review history included.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.topic.updateMany({
      where: { id: params.id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'No deleted topic found with that id' }, { status: 404 });
    }
    const topic = await db.topic.findFirst({ where: { id: params.id, userId } });
    return NextResponse.json(topic);
  } catch (e) {
    console.error('Failed to restore topic:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
