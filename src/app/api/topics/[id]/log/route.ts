import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { fieldChanged, oldValue = null, newValue } = body;

    if (!fieldChanged || !newValue) {
      return NextResponse.json({ error: 'fieldChanged and newValue are required' }, { status: 400 });
    }

    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null } });
    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const log = await db.activityLog.create({
      data: {
        userId,
        topicId: params.id,
        fieldChanged,
        oldValue,
        newValue,
      },
    });

    // Also update lastTouchedDate on the Topic card to keep it fresh
    await db.topic.update({
      where: { id: params.id },
      data: { lastTouchedDate: new Date() },
    });

    return NextResponse.json(log);
  } catch (e) {
    console.error('Failed to create custom activity log:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
