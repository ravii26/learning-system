import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadPace } from '@/lib/paceData';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const topicId = new URL(request.url).searchParams.get('topicId') ?? undefined;
    return NextResponse.json(await loadPace(db, auth.userId, topicId));
  } catch (e) {
    console.error('Failed to load pace:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
