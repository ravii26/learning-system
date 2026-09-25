import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { buildQuizMissCards, isValidQuizQuestion } from '@/lib/reviewCards';
import { addReviewCards } from '@/lib/reviewCardPersist';

/**
 * Records a checked quiz for a module. Correctness is computed here from
 * the cached lesson — the client only says which option was chosen for
 * each question — and every wrong answer becomes a Daily Review card due
 * tomorrow. (Challenge attempts are recorded by the evaluator itself; see
 * /api/socratic action 'evaluate'.)
 */
export async function POST(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json().catch(() => null);
    const selections = body?.selections;
    if (!selections || typeof selections !== 'object') {
      return NextResponse.json({ error: 'selections is required: { questionIndex: optionIndex }' }, { status: 400 });
    }

    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const lesson = await db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId } });
    const quiz = (lesson?.content as Record<string, unknown> | null)?.quiz;
    const questions = (Array.isArray(quiz) ? quiz : []).filter(isValidQuizQuestion);
    if (questions.length === 0) {
      return NextResponse.json({ error: 'No saved quiz for this module' }, { status: 400 });
    }

    const sel: Record<number, number> = {};
    for (const [k, v] of Object.entries(selections as Record<string, unknown>)) {
      const i = Number(k);
      if (Number.isInteger(i) && Number.isInteger(v)) sel[i] = v as number;
    }

    const details = questions.map((q, i) => {
      const chosenIdx = sel[i];
      return {
        question: q.question,
        chosen: chosenIdx !== undefined ? q.options[chosenIdx] ?? null : null,
        correctAnswer: q.options[q.correctIndex],
        isCorrect: chosenIdx === q.correctIndex,
      };
    });
    const correct = details.filter((d) => d.isCorrect).length;

    const result = await db.$transaction(async (tx) => {
      const attempt = await tx.moduleAttempt.create({
        data: {
          userId,
          topicId: params.id,
          moduleId: params.moduleId,
          kind: 'quiz',
          score: correct / questions.length,
          correct,
          total: questions.length,
          details,
        },
      });
      const cards = await addReviewCards(tx, userId, params.id, params.moduleId, buildQuizMissCards(questions, sel), { dueInDays: 1 });
      return { attempt, cardsAdded: cards.added };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error('Failed to record quiz attempt:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
