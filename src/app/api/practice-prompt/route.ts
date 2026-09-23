import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { pickPracticePrompt } from '@/lib/practicePrompt';

const FALLBACK_PROMPT = "What's one thing you learned this week? Explain it out loud for 2 minutes.";

/**
 * The daily rep prompt — drawn from a concept currently in the review
 * cycle where possible (the cross-mode payoff: practice doubles as
 * retrieval practice), falling back to a generic prompt when nothing is
 * currently being reviewed at all.
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const concepts = await db.concept.findMany({
      where: { userId, suspended: false, state: { in: ['Learning', 'Review'] } },
      select: { id: true, title: true, nextReview: true },
    });

    const pick = pickPracticePrompt(concepts);
    if (!pick) {
      return NextResponse.json({ promptText: FALLBACK_PROMPT, conceptId: null, conceptTitle: null });
    }
    return NextResponse.json(pick);
  } catch (e) {
    console.error('Failed to pick practice prompt:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
