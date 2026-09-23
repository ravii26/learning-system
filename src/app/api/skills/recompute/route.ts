import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { recomputeAllSkills } from '@/lib/masteryRecompute';

/**
 * Recomputes every skill's mastery score. See src/lib/masteryRecompute.ts:
 * failures are per-skill and always surfaced in the response, never
 * swallowed — a skill silently left with a stale computedAt after an error
 * looks fine until someone notices the number is wrong.
 */
export async function POST() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const result = await recomputeAllSkills(db, userId);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to recompute skills:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
