import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { schedule, type Grade } from '@/lib/fsrs';
import { enumToLabel, MASTERY_ENUM_VALUES } from '@/lib/masteryLevel';
import { mirrorConceptsToJson } from '@/lib/conceptSync';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const now = new Date();

    // Replaces the old full-table scan (load every active/maintenance
    // topic, loop every concept in JS). Concept.@@index([userId, suspended,
    // nextReview]) makes this an index lookup.
    const rows = await db.concept.findMany({
      where: {
        userId,
        suspended: false,
        masteryLevel: { not: 'Unknown' }, // matches the old `if (c.status === 'Unknown') continue;`
        OR: [{ nextReview: null }, { nextReview: { lte: now } }],
        topic: { status: { in: ['active', 'maintenance'] } },
      },
      include: { topic: { select: { title: true, area: true } } },
      orderBy: { nextReview: 'asc' },
    });

    // Same response shape as before the migration, so SpacedReviewQueue.tsx
    // and review/page.tsx (both consumers of this endpoint) keep working
    // without changes beyond conceptId now being a row id.
    const dueConcepts = rows.map((c) => ({
      topicId: c.topicId,
      topicTitle: c.topic.title,
      topicArea: c.topic.area,
      conceptId: c.id,
      conceptTitle: c.title,
      conceptStatus: enumToLabel(c.masteryLevel),
      difficulty: c.difficultyTag || 'Medium',
      importance: c.importance || 'Medium',
      lastRecalledAt: c.lastReview ? c.lastReview.toISOString() : null,
      reviewIntervalDays: c.scheduledDays,
      // Approximation: FSRS tracks total reps, not a "reset to 0 on any
      // fail" streak like the old field did. This is display-only text
      // ("Recalls: N") in the UI, not a scheduling input, so the drift in
      // meaning is acceptable — it no longer resets to 0 after one lapse.
      consecutiveRecalls: c.reps,
    }));

    return NextResponse.json({ dueConcepts });
  } catch (e) {
    console.error('Failed to get due spaced concepts:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { topicId, conceptId, mistakeText, whyMade, howToAvoid } = body;

    if (!topicId || !conceptId) {
      return NextResponse.json({ error: 'topicId and conceptId are required' }, { status: 400 });
    }

    // Accept either the new 4-level grade (SpacedReviewQueue.tsx, updated
    // in this phase) or the legacy boolean `success` — still sent by
    // topics/[id]/page.tsx's Socratic-coach flow and review/page.tsx,
    // neither touched in this phase.
    let grade: Grade | undefined = body.grade;
    if (!grade) {
      if (body.success === undefined) {
        return NextResponse.json({ error: 'grade or success is required' }, { status: 400 });
      }
      grade = body.success ? 'Good' : 'Again';
    }
    const success = grade !== 'Again';

    // conceptId may be a row id (from this route's own GET, or the new
    // SpacedReviewQueue) or a legacy id (from topic.knowledgeMap, still the
    // source for the Socratic coach's selectedConcept). Try both.
    let concept = await db.concept.findFirst({ where: { id: conceptId, userId } });
    if (!concept) {
      concept = await db.concept.findFirst({ where: { topicId, legacyId: conceptId, userId } });
    }
    if (!concept) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }

    const topic = await db.topic.findFirst({ where: { id: concept.topicId, userId } });
    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const result = schedule(
      {
        state: concept.state,
        stability: concept.stability ?? 0,
        difficulty: concept.difficulty ?? 5,
        reps: concept.reps,
        lapses: concept.lapses,
        lastReview: concept.lastReview,
      },
      grade
    );

    // Mastery-ladder promotion/demotion, preserved from the pre-FSRS
    // behavior: one rung up on any success (capped at Can Explain — Teach
    // and Create aren't earned by a recall pass alone), back down to
    // Understood from Can Recall/Can Apply on a fail.
    const currentIdx = MASTERY_ENUM_VALUES.indexOf(concept.masteryLevel);
    let nextMasteryLevel = concept.masteryLevel;
    if (success) {
      const ceilingIdx = MASTERY_ENUM_VALUES.indexOf('CanExplain');
      if (currentIdx !== -1 && currentIdx < ceilingIdx) {
        nextMasteryLevel = MASTERY_ENUM_VALUES[currentIdx + 1];
      }
    } else if (concept.masteryLevel === 'CanRecall' || concept.masteryLevel === 'CanApply') {
      nextMasteryLevel = 'Understood';
    }

    const conceptId_ = concept.id;
    const topicId_ = concept.topicId;

    await db.$transaction(async (tx) => {
      await tx.concept.update({
        where: { id: conceptId_ },
        data: {
          state: result.state,
          stability: result.stability,
          difficulty: result.difficulty,
          reps: result.reps,
          lapses: result.lapses,
          elapsedDays: result.elapsedDays,
          scheduledDays: result.scheduledDays,
          lastReview: result.lastReview,
          nextReview: result.nextReview,
          masteryLevel: nextMasteryLevel,
          seededFromLegacy: false, // this concept now has a real post-migration review
        },
      });

      await tx.reviewLog.create({
        data: {
          userId,
          conceptId: conceptId_,
          grade,
          stateBefore: concept!.state,
          stateAfter: result.state,
          stabilityBefore: concept!.stability,
          stabilityAfter: result.stability,
          difficultyAfter: result.difficulty,
          elapsedDays: result.elapsedDays,
          scheduledDays: result.scheduledDays,
          nextReview: result.nextReview,
        },
      });

      // Mistake-bank logging — unchanged, stays a Json column.
      if (!success && mistakeText) {
        const existingMistakes = (topic.mistakes as any[]) || [];
        const newMistake = {
          id: Math.random().toString(36).substring(2, 9),
          concept: concept!.title,
          mistake: String(mistakeText).trim(),
          whyMade: (whyMade || '').trim(),
          correctUnderstanding: 'Verify concept rules and constraints.',
          example: '',
          howToAvoid: (howToAvoid || '').trim(),
          createdAt: new Date().toISOString(),
        };
        await tx.topic.update({
          where: { id: topicId_ },
          data: { mistakes: [...existingMistakes, newMistake] },
        });
      }

      // Mirror the row change back into the JSON blob the pre-migration UI
      // (KnowledgeMap.tsx, KnowledgeGraph.tsx) still reads directly.
      const mirrored = await mirrorConceptsToJson(tx, topicId_);
      await tx.topic.update({
        where: { id: topicId_ },
        data: { knowledgeMap: mirrored as object, lastTouchedDate: new Date() },
      });
    });

    const updatedTopic = await db.topic.findUnique({ where: { id: topicId_ } });
    return NextResponse.json(updatedTopic);
  } catch (e) {
    console.error('Failed to log spaced review:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
