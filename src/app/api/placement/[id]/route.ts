import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { addReviewCards } from '@/lib/reviewCardPersist';
import { mirrorCurriculumToJson } from '@/lib/curriculumSync';
import { gradePlacement, placementCard, PLACEMENT_STABILITY_DAYS, type PlacementQuestion } from '@/lib/placement';

/**
 * Submit a placement check. For every module where you got all questions
 * right: the module is marked finished, the result is saved as its passed
 * check, and its questions become review cards seeded as known (due in 7
 * days to confirm). Missed modules are left exactly as they were — a
 * wrong guess on something you haven't studied isn't evidence of anything.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const check = await db.placementCheck.findFirst({ where: { id: params.id, userId } });
    if (!check) return NextResponse.json({ error: 'Placement check not found' }, { status: 404 });
    if (check.submittedAt) return NextResponse.json({ error: 'Already submitted' }, { status: 400 });

    const body = await request.json().catch(() => null);
    const raw = body?.answers;
    if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'answers is required: { questionIndex: optionIndex }' }, { status: 400 });
    const answers: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const i = Number(k);
      const a = Number(v);
      if (Number.isInteger(i) && Number.isInteger(a)) answers[i] = a;
    }

    const questions = check.questions as unknown as PlacementQuestion[];
    const results = gradePlacement(questions, answers);
    const passed = results.filter((r) => r.passed);
    const now = new Date();

    await db.$transaction(async (tx) => {
      for (const r of passed) {
        const updated = await tx.curriculumItem.updateMany({
          where: { userId, topicId: check.topicId, legacyId: r.moduleId, removed: false },
          data: { completed: true, completedAt: now },
        });
        if (updated.count === 0) continue; // module removed since the check was written
        const own = questions.filter((q) => q.moduleId === r.moduleId);
        await tx.moduleAttempt.create({
          data: {
            userId,
            topicId: check.topicId,
            moduleId: r.moduleId,
            kind: 'quiz',
            score: 1,
            correct: r.correct,
            total: r.total,
            details: { source: 'placement', placementCheckId: check.id, questions: own.map((q) => q.question) },
          },
        });
        await addReviewCards(tx, userId, check.topicId, r.moduleId, own.map(placementCard), {
          now,
          asKnown: { stabilityDays: PLACEMENT_STABILITY_DAYS },
        });
      }
      if (passed.length > 0) {
        await tx.topic.update({ where: { id: check.topicId }, data: { curriculum: (await mirrorCurriculumToJson(tx, check.topicId)) as object[] } });
      }
      await tx.placementCheck.update({
        where: { id: check.id },
        data: { answers: answers as Prisma.InputJsonValue, results: results as unknown as Prisma.InputJsonValue, submittedAt: now },
      });
    });

    return NextResponse.json({
      results,
      review: questions.map((q, i) => ({
        moduleId: q.moduleId,
        question: q.question,
        chosen: answers[i] ?? null,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      })),
    });
  } catch (e) {
    console.error('Failed to submit placement check:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
