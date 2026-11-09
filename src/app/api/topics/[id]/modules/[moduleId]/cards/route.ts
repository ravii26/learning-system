import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { cardTitleFrom } from '@/lib/lessonAssist';
import { addReviewCards } from '@/lib/reviewCardPersist';

const MAX_PROMPT = 500;
const MAX_ANSWER = 5000;

/** A review card made by hand from text selected in the lesson. */
export async function POST(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; answer?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT) : '';
    const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, MAX_ANSWER) : '';
    if (!prompt || !answer) return NextResponse.json({ error: 'A card needs a question and an answer.' }, { status: 400 });

    const result = await db.$transaction((tx) => addReviewCards(tx, userId, params.id, params.moduleId, [
      { title: cardTitleFrom(prompt), prompt, answer, sourceKind: 'lesson_card' },
    ], { dueInDays: 1 }));
    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to make a review card:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
