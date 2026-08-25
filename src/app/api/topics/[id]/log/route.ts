import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

function checkAuth() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { fieldChanged, oldValue = null, newValue } = body;

    if (!fieldChanged || !newValue) {
      return NextResponse.json({ error: 'fieldChanged and newValue are required' }, { status: 400 });
    }

    const log = await db.activityLog.create({
      data: {
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
