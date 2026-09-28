import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { getMap } from '@/data/competencies';
import { CATALOG } from '@/data/resources';
import { rowToMap, sanitizeEditedMap, saveFieldMap } from '@/lib/program/library';

/** One field: your version if you have one, else the built-in list; plus resources. */
export async function GET(_request: Request, { params }: { params: { key: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const [row, trusted] = await Promise.all([
      db.fieldMap.findUnique({ where: { userId_key: { userId, key: params.key } } }),
      db.fieldResource.findMany({ where: { userId, fieldKey: params.key }, orderBy: { createdAt: 'asc' } }),
    ]);
    const builtIn = getMap(params.key);
    if (!row && !builtIn) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      map: row ? rowToMap(row) : builtIn,
      source: row ? row.source : 'builtin',
      basedOn: row?.basedOn ?? (builtIn ? builtIn.key : null),
      isBuiltIn: !!builtIn,
      customised: !!row && !!builtIn,
      sources: row?.sources ?? null,
      trusted: trusted.map((t) => ({ id: t.id, title: t.title, url: t.url, type: t.type, pricing: t.pricing, role: t.role, competencyKeys: t.competencyKeys, note: t.note })),
      catalog: builtIn ? CATALOG.filter((c) => c.fields.includes(builtIn.key)).map((c) => ({ title: c.title, url: c.url, pricing: c.pricing, role: c.role })) : [],
    });
  } catch (e) {
    console.error('Failed to load field:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Saves your edited list. Editing a built-in list creates your personal copy;
 * the built-in one (and everyone else's) is untouched.
 */
export async function PUT(request: Request, { params }: { params: { key: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { map?: unknown };
    const existing = await db.fieldMap.findUnique({ where: { userId_key: { userId, key: params.key } }, select: { source: true, basedOn: true, sharedFromUserId: true } });
    const builtIn = getMap(params.key);
    if (!existing && !builtIn) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { map, problems } = sanitizeEditedMap(body.map, params.key, builtIn?.title ?? params.key);
    if (!map) return NextResponse.json({ error: 'That topic list has problems.', problems }, { status: 400 });
    await saveFieldMap(db, userId, map, {
      source: existing ? (existing.source === 'ai' ? 'ai' : 'edited') : 'edited',
      basedOn: existing?.basedOn ?? (builtIn ? builtIn.key : null),
      sharedFromUserId: existing?.sharedFromUserId ?? null,
    });
    return NextResponse.json({ success: true, topics: map.competencies.length });
  } catch (e) {
    console.error('Failed to save field:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Removes your version: a customised built-in goes back to the original; your own field is deleted. */
export async function DELETE(_request: Request, { params }: { params: { key: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await db.fieldMap.deleteMany({ where: { userId, key: params.key } });
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!getMap(params.key)) await db.fieldResource.deleteMany({ where: { userId, fieldKey: params.key } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete field:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
