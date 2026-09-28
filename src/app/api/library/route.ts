import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { CURATED_MAPS } from '@/data/competencies';
import { displayName } from '@/lib/friends';

/**
 * Your field library: built-in topic lists (marked if you've customised
 * them), your own lists, and lists friends have shared with you.
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const [mine, incoming] = await Promise.all([
      db.fieldMap.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { key: true, title: true, aliases: true, source: true, basedOn: true, competencies: true, updatedAt: true } }),
      db.fieldMapShare.findMany({
        where: { toUserId: userId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, fieldKey: true, createdAt: true, from: { select: { name: true, email: true } } },
      }),
    ]);
    const customised = new Set(mine.map((m) => m.key));
    return NextResponse.json({
      builtIn: CURATED_MAPS.map((m) => ({ key: m.key, title: m.title, topics: m.competencies.length, customised: customised.has(m.key) })),
      mine: mine.map((m) => ({
        key: m.key, title: m.title, aliases: m.aliases, source: m.source, basedOn: m.basedOn, updatedAt: m.updatedAt,
        topics: Array.isArray(m.competencies) ? m.competencies.length : 0,
        // Topic count at each level, so the plan builder can show sizes before drafting.
        levels: (['aware', 'use', 'build', 'interview'] as const).map((t, i) =>
          (Array.isArray(m.competencies) ? (m.competencies as Array<{ from?: string }>) : [])
            .filter((c) => ['aware', 'use', 'build', 'interview'].indexOf(c.from ?? 'use') <= i).length),
      })),
      incoming: incoming.map((s) => ({ id: s.id, title: s.title, fieldKey: s.fieldKey, createdAt: s.createdAt, from: displayName(s.from) })),
    });
  } catch (e) {
    console.error('Failed to load library:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
