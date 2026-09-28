import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { decideCheckin } from '@/lib/program/checkinServer';
import type { Decision } from '@/lib/program/checkin';

const ACTIONS = ['accept', 'decline', 'modify'];

/** Accept / modify / decline each proposed change. Accepted changes create the next plan version. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { checkinId?: unknown; decisions?: unknown };
    if (typeof body.checkinId !== 'string' || !Array.isArray(body.decisions)) {
      return NextResponse.json({ error: 'checkinId and decisions are required' }, { status: 400 });
    }
    const decisions: Decision[] = body.decisions
      .filter((d: any) => d && Number.isInteger(d.index) && ACTIONS.includes(d.action))
      .slice(0, 10)
      .map((d: any) => ({ index: d.index, action: d.action, value: typeof d.value === 'number' || typeof d.value === 'string' ? d.value : undefined }));

    const result = await decideCheckin(db, userId, params.id, body.checkinId, decisions);
    if ('error' in result) {
      return NextResponse.json({ error: result.error === 'already_decided' ? 'This check-in was already decided.' : 'Check-in not found' }, { status: result.error === 'already_decided' ? 409 : 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to apply check-in decisions:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
