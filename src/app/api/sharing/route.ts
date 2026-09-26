import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/** Your topics and goals with their shared flag: the "What you share" list. */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const [topics, goals] = await Promise.all([
      db.topic.findMany({
        where: { userId, deletedAt: null, status: { not: 'dropped' } },
        select: { id: true, title: true, area: true, status: true, shared: true },
        orderBy: [{ shared: 'desc' }, { lastTouchedDate: 'desc' }],
      }),
      db.goal.findMany({
        where: { userId, status: { not: 'abandoned' } },
        select: { id: true, title: true, status: true, shared: true },
        orderBy: [{ shared: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    return NextResponse.json({ topics, goals });
  } catch (e) {
    console.error('Failed to load sharing settings:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { kind, id, shared } = (await request.json().catch(() => ({}))) as { kind?: string; id?: unknown; shared?: unknown };
    if ((kind !== 'topic' && kind !== 'goal') || typeof id !== 'string' || typeof shared !== 'boolean') {
      return NextResponse.json({ error: 'kind (topic|goal), id and shared (boolean) are required' }, { status: 400 });
    }
    const result = kind === 'topic'
      ? await db.topic.updateMany({ where: { id, userId, deletedAt: null }, data: { shared } })
      : await db.goal.updateMany({ where: { id, userId }, data: { shared } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to update sharing:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
