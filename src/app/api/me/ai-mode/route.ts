import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/** Switch between the app's AI and "use my own ChatGPT/Claude" (copy-paste). */
export async function PUT(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const b = (await request.json().catch(() => ({}))) as { aiMode?: unknown };
  if (b.aiMode !== 'app' && b.aiMode !== 'manual') return NextResponse.json({ error: 'aiMode must be "app" or "manual"' }, { status: 400 });
  await db.user.update({ where: { id: auth.userId }, data: { aiMode: b.aiMode } });
  return NextResponse.json({ aiMode: b.aiMode });
}
