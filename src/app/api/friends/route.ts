import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { displayName } from '@/lib/friends';
import { normalizeEmail, isValidEmail } from '@/lib/password';
import { consume, tooManyRequests, DAY } from '@/lib/rateLimit';

const person = { select: { id: true, name: true, email: true } } as const;
type Person = { id: string; name: string | null; email: string | null };
const view = (u: Person) => ({ id: u.id, name: displayName(u), email: u.email });

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const rows = await db.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: person, addressee: person },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      friends: rows
        .filter((r) => r.status === 'accepted')
        .map((r) => ({ friendshipId: r.id, user: view(r.requesterId === userId ? r.addressee : r.requester) })),
      incoming: rows
        .filter((r) => r.status === 'pending' && r.addresseeId === userId)
        .map((r) => ({ friendshipId: r.id, user: view(r.requester) })),
      outgoing: rows
        .filter((r) => r.status === 'pending' && r.requesterId === userId)
        .map((r) => ({ friendshipId: r.id, user: view(r.addressee) })),
    });
  } catch (e) {
    console.error('Failed to load friends:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Same reply whether or not the email has an account, so this can't be
// used to find out who has signed up.
const SENT = { sent: true, message: 'If that email has an account, they will see your request.' };

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { email } = (await request.json().catch(() => ({}))) as { email?: unknown };
    if (typeof email !== 'string' || !isValidEmail(normalizeEmail(email))) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    const limit = await consume(`friend-request:${userId}`, 20, DAY);
    if (limit.blocked) return tooManyRequests('Too many friend requests today. Try again tomorrow.', limit);

    const target = await db.user.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
    if (target?.id === userId) return NextResponse.json({ error: 'That is your own email.' }, { status: 400 });
    if (!target) return NextResponse.json(SENT);

    const existing = await db.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
      },
    });
    if (!existing) {
      await db.friendship.create({ data: { requesterId: userId, addresseeId: target.id } });
    } else if (existing.status === 'pending' && existing.addresseeId === userId) {
      // They already asked you; asking back means yes.
      await db.friendship.update({ where: { id: existing.id }, data: { status: 'accepted', respondedAt: new Date() } });
    }
    return NextResponse.json(SENT);
  } catch (e) {
    console.error('Failed to send friend request:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
