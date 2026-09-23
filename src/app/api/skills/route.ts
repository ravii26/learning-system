import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/** Flat list — the client builds the Area -> Skill -> sub-skill tree from parentId. */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const skills = await db.skill.findMany({
      where: { userId },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { topics: true } },
      },
    });

    return NextResponse.json(skills);
  } catch (e) {
    console.error('Failed to list skills:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
