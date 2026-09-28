import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

export async function DELETE(_request: Request, { params }: { params: { key: string; id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.fieldResource.deleteMany({ where: { id: params.id, userId, fieldKey: params.key } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to remove trusted resource:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
