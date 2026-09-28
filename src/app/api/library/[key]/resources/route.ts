import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { getMap } from '@/data/competencies';
import { isUsable, verifyLink } from '@/lib/resources/verifyLink';

const TYPES = ['BOOK', 'COURSE', 'VIDEO', 'DOCS', 'ARTICLE', 'PRACTICE', 'TOOL'];
const PRICING = ['free', 'freemium', 'paid', 'unknown'];
const ROLES = ['primary', 'practice', 'reference', 'supplementary'];

/** Marks a resource as trusted for this field. The link is checked first. */
export async function POST(request: Request, { params }: { params: { key: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const hasField = getMap(params.key) || (await db.fieldMap.findUnique({ where: { userId_key: { userId, key: params.key } }, select: { id: true } }));
    if (!hasField) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 160) : '';
    const url = typeof b.url === 'string' ? b.url.trim().slice(0, 500) : '';
    if (!title || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'A title and a link (http or https) are required.' }, { status: 400 });
    const check = await verifyLink(url);
    if (!isUsable(check.status)) return NextResponse.json({ error: 'That link does not open. Check it and try again.' }, { status: 400 });

    const row = await db.fieldResource.upsert({
      where: { userId_fieldKey_url: { userId, fieldKey: params.key, url } },
      create: {
        userId, fieldKey: params.key, title, url,
        type: TYPES.includes(String(b.type)) ? String(b.type) : 'ARTICLE',
        pricing: PRICING.includes(String(b.pricing)) ? String(b.pricing) : 'unknown',
        role: ROLES.includes(String(b.role)) ? String(b.role) : 'reference',
        competencyKeys: Array.isArray(b.competencyKeys) ? b.competencyKeys.filter((k): k is string => typeof k === 'string').slice(0, 30) : [],
        note: typeof b.note === 'string' ? b.note.slice(0, 300) : '',
        linkStatus: check.status,
      },
      update: { title },
    });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e) {
    console.error('Failed to add trusted resource:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
