import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadProgramView } from '@/lib/program/load';

/** The goal's active learning program with live evidence, or 404 if the goal has none. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const view = await loadProgramView(db, userId, params.id);
    if (!view) return NextResponse.json({ error: 'No program for this goal' }, { status: 404 });
    return NextResponse.json(view);
  } catch (e) {
    console.error('Failed to load program:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
