import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadTopicKnowledge } from '@/lib/topicKnowledge';

/**
 * One row per topic of the evidence the app has actually collected — time
 * given, modules finished, quiz scores, challenge verdicts, review cards —
 * so "where do I stand" is answered by what you did, not by a slider.
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const topics = await db.topic.findMany({
      where: { userId, deletedAt: null, status: { not: 'dropped' } },
      select: { id: true, title: true, area: true, status: true, mode: true, lastTouchedDate: true },
      orderBy: { lastTouchedDate: 'desc' },
    });
    const ids = topics.map((t) => t.id);

    const [timeAll, time30, modules, attempts, cardsTotal, cardsDue, knowledge, problems, reps] = await Promise.all([
      db.studyTimeEntry.groupBy({ by: ['topicId'], where: { userId, topicId: { in: ids } }, _sum: { seconds: true } }),
      db.studyTimeEntry.groupBy({ by: ['topicId'], where: { userId, topicId: { in: ids }, startedAt: { gte: since30 } }, _sum: { seconds: true } }),
      db.curriculumItem.groupBy({ by: ['topicId', 'completed'], where: { userId, topicId: { in: ids }, removed: false }, _count: { _all: true } }),
      db.moduleAttempt.findMany({
        where: { userId, topicId: { in: ids } },
        select: { topicId: true, moduleId: true, kind: true, score: true, verdict: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.concept.groupBy({ by: ['topicId'], where: { userId, topicId: { in: ids }, suspended: false, masteryLevel: { not: 'Unknown' } }, _count: { _all: true } }),
      db.concept.groupBy({
        by: ['topicId'],
        where: {
          userId,
          topicId: { in: ids },
          suspended: false,
          masteryLevel: { not: 'Unknown' },
          OR: [{ nextReview: null }, { nextReview: { lte: now } }],
        },
        _count: { _all: true },
      }),
      loadTopicKnowledge(userId, ids, now),
      db.problemAttempt.groupBy({ by: ['topicId', 'outcome'], where: { userId, topicId: { in: ids } }, _count: { _all: true } }),
      db.practiceRep.findMany({ where: { userId, topicId: { in: ids } }, select: { topicId: true, score: true }, orderBy: { occurredAt: 'asc' } }),
    ]);

    const sumBy = (rows: Array<{ topicId: string; _sum: { seconds: number | null } }>) =>
      new Map(rows.map((r) => [r.topicId, r._sum.seconds ?? 0]));
    const countBy = (rows: Array<{ topicId: string; _count: { _all: number } }>) =>
      new Map(rows.map((r) => [r.topicId, r._count._all]));
    const allTime = sumBy(timeAll);
    const last30 = sumBy(time30);
    const cardTotals = countBy(cardsTotal);
    const cardDue = countBy(cardsDue);

    // Latest attempt per (topic, module, kind) — a retake replaces the old score.
    const latest = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) {
      const key = `${a.topicId}|${a.moduleId}|${a.kind}`;
      if (!latest.has(key)) latest.set(key, a);
    }

    const rows = topics.map((t) => {
      const mods = modules.filter((m) => m.topicId === t.id);
      const modulesTotal = mods.reduce((s, m) => s + m._count._all, 0);
      const modulesDone = mods.filter((m) => m.completed).reduce((s, m) => s + m._count._all, 0);
      const mine = Array.from(latest.values()).filter((a) => a.topicId === t.id);
      const quizzes = mine.filter((a) => a.kind === 'quiz' && a.score !== null);
      const challenges = mine.filter((a) => a.kind === 'challenge' && a.verdict);
      const lastActivity = mine[0]?.createdAt ?? null;
      return {
        ...t,
        seconds30: last30.get(t.id) ?? 0,
        secondsAll: allTime.get(t.id) ?? 0,
        modulesTotal,
        modulesDone,
        quizCount: quizzes.length,
        quizAvg: quizzes.length ? quizzes.reduce((s, q) => s + (q.score ?? 0), 0) / quizzes.length : null,
        challenges: {
          correct: challenges.filter((c) => c.verdict === 'correct').length,
          partial: challenges.filter((c) => c.verdict === 'partial').length,
          incorrect: challenges.filter((c) => c.verdict === 'incorrect').length,
        },
        cardsTotal: cardTotals.get(t.id) ?? 0,
        cardsDue: cardDue.get(t.id) ?? 0,
        lastActivity,
        problems: {
          cold: problems.find((p) => p.topicId === t.id && p.outcome === 'cold')?._count._all ?? 0,
          hint: problems.find((p) => p.topicId === t.id && p.outcome === 'hint')?._count._all ?? 0,
          stuck: problems.find((p) => p.topicId === t.id && p.outcome === 'stuck')?._count._all ?? 0,
        },
        knowledge: knowledge.get(t.id)
          ? {
              unit: knowledge.get(t.id)!.unit,
              counts: knowledge.get(t.id)!.counts,
              states: knowledge.get(t.id)!.items.map((i) => i.state),
              items: knowledge.get(t.id)!.items,
            }
          : null,
        practice: (() => {
          const own = reps.filter((r) => r.topicId === t.id);
          return { reps: own.length, recentScores: own.slice(-12).map((r) => r.score) };
        })(),
      };
    });

    return NextResponse.json({ topics: rows });
  } catch (e) {
    console.error('Failed to load progress:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
