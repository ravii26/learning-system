import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { getMap } from '@/data/competencies';
import { areFriends } from '@/lib/friends';
import { rowToMap } from '@/lib/program/library';

/**
 * Shares your version of a field with a friend. The list and your trusted
 * resources are snapshotted now; when they accept, their library gets
 * exactly this.
 */
export async function POST(request: Request, { params }: { params: { key: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { friendId } = (await request.json().catch(() => ({}))) as { friendId?: unknown };
    if (typeof friendId !== 'string' || !(await areFriends(userId, friendId))) {
      return NextResponse.json({ error: 'You can only share with a friend.' }, { status: 400 });
    }
    const [row, trusted] = await Promise.all([
      db.fieldMap.findUnique({ where: { userId_key: { userId, key: params.key } } }),
      db.fieldResource.findMany({ where: { userId, fieldKey: params.key } }),
    ]);
    const map = row ? rowToMap(row) : getMap(params.key);
    if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const snapshot = {
      map,
      basedOn: row?.basedOn ?? (getMap(params.key) ? params.key : null),
      resources: trusted.map((t) => ({ title: t.title, url: t.url, type: t.type, pricing: t.pricing, role: t.role, competencyKeys: t.competencyKeys, note: t.note })),
    };
    const share = await db.fieldMapShare.create({
      data: { fromUserId: userId, toUserId: friendId, fieldKey: map.key, title: map.title, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ id: share.id }, { status: 201 });
  } catch (e) {
    console.error('Failed to share field:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
