import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/**
 * accept / decline: the addressee, on a pending request
 * cancel:           the requester, on a pending request
 * remove:           either side, on an accepted friendship
 * Declined, cancelled and removed rows are deleted.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { action } = (await request.json().catch(() => ({}))) as { action?: string };
    const row = await db.friendship.findFirst({
      where: { id: params.id, OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

    const isAddressee = row.addresseeId === userId;
    const pending = row.status === 'pending';

    if (action === 'accept' && pending && isAddressee) {
      await db.friendship.update({ where: { id: row.id }, data: { status: 'accepted', respondedAt: new Date() } });
      return NextResponse.json({ success: true });
    }
    const deletable =
      (action === 'decline' && pending && isAddressee) ||
      (action === 'cancel' && pending && !isAddressee) ||
      (action === 'remove' && !pending);
    if (deletable) {
      await db.friendship.delete({ where: { id: row.id } });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'That action is not allowed here.' }, { status: 400 });
  } catch (e) {
    console.error('Failed to update friendship:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
