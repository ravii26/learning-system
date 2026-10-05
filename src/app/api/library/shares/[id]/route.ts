import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/apiAuth';
import { validateMap, type CompetencyMap } from '@/data/competencies';
import { saveFieldMap } from '@/lib/program/library';

interface Snapshot {
  map: CompetencyMap;
  basedOn: string | null;
  resources: Array<{ title: string; url: string; type: string; pricing: string; role: string; competencyKeys: string[]; note: string }>;
}

/**
 * Accept or decline a shared field. Accepting makes your version exactly the
 * sender's snapshot: the same topic list and the same trusted resources
 * (replacing yours for that field).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { action } = (await request.json().catch(() => ({}))) as { action?: string };
    const share = await db.fieldMapShare.findFirst({ where: { id: params.id, toUserId: userId, status: 'pending' } });
    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (action === 'decline') {
      await db.fieldMapShare.update({ where: { id: share.id }, data: { status: 'declined', respondedAt: new Date() } });
      return NextResponse.json({ success: true });
    }
    if (action !== 'accept') return NextResponse.json({ error: 'action must be accept or decline' }, { status: 400 });

    const snap = share.snapshot as unknown as Snapshot;
    if (!snap?.map || validateMap(snap.map).length) return NextResponse.json({ error: 'This shared list is not valid.' }, { status: 400 });

    await db.$transaction(async (tx) => {
      await saveFieldMap(tx, userId, snap.map, { source: 'shared', basedOn: snap.basedOn, sharedFromUserId: share.fromUserId });
      await tx.fieldResource.deleteMany({ where: { userId, fieldKey: snap.map.key } });
      for (const r of snap.resources ?? []) {
        await tx.fieldResource.create({
          data: { userId, fieldKey: snap.map.key, title: r.title, url: r.url, type: r.type, pricing: r.pricing, role: r.role, competencyKeys: r.competencyKeys ?? [], note: r.note ?? '' },
        });
      }
      await tx.fieldMapShare.update({ where: { id: share.id }, data: { status: 'accepted', respondedAt: new Date() } });
    });
    return NextResponse.json({ success: true, key: snap.map.key });
  } catch (e) {
    console.error('Failed to answer shared field:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
