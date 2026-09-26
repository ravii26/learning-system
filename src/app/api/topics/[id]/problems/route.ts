import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { addReviewCards } from '@/lib/reviewCardPersist';
import { parseProblemInput, problemReviewCard, summarizeProblems } from '@/lib/problems';

/** The problem log for a topic: newest first, with outcome counts. `?moduleId` narrows the list, not the summary. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const moduleId = new URL(request.url).searchParams.get('moduleId');
    const all = await db.problemAttempt.findMany({ where: { userId, topicId: params.id }, orderBy: { attemptedAt: 'desc' } });
    return NextResponse.json({
      problems: moduleId ? all.filter((p) => p.moduleId === moduleId) : all,
      summary: summarizeProblems(all),
    });
  } catch (e) {
    console.error('Failed to load problems:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * Log a problem. If you needed a hint or got stuck and wrote down the key
 * idea, it also becomes a review card due in 3 days, so the idea comes back
 * before the next similar problem.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const parsed = parseProblemInput(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { attemptedAt, ...fields } = parsed.value;

    const result = await db.$transaction(async (tx) => {
      const problem = await tx.problemAttempt.create({
        data: { ...fields, userId, topicId: params.id, ...(attemptedAt ? { attemptedAt } : {}) },
      });
      const card = problemReviewCard(problem as { title: string; outcome: 'cold' | 'hint' | 'stuck'; notes: string | null });
      const cards = card ? await addReviewCards(tx, userId, params.id, problem.moduleId, [card], { dueInDays: 3 }) : { added: 0 };
      return { problem, cardsAdded: cards.added };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to log problem:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
