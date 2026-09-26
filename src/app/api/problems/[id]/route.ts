import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { parseProblemInput } from '@/lib/problems';

/** Correct a logged problem. Send the whole problem, as the log form does. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const parsed = parseProblemInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { attemptedAt, ...fields } = parsed.value;

    const result = await db.problemAttempt.updateMany({
      where: { id: params.id, userId },
      data: { ...fields, ...(attemptedAt ? { attemptedAt } : {}) },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    return NextResponse.json(await db.problemAttempt.findUnique({ where: { id: params.id } }));
  } catch (e) {
    console.error('Failed to update problem:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.problemAttempt.deleteMany({ where: { id: params.id, userId } });
    if (result.count === 0) return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete problem:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
