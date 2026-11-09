import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { forecastGoal, remainingWork, RECENT_DAYS } from '@/lib/goalForecast';
import { loadPace } from '@/lib/paceData';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const goal = await db.goal.findFirst({
      where: { id: params.id, userId },
      select: {
        targetDate: true,
        links: { where: { topicId: { not: null } }, select: { topicId: true } },
        programs: { where: { status: 'active' }, select: { items: { select: { topicId: true, hoursPerWeek: true, weeks: true } } } },
      },
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    const planItems = goal.programs.flatMap((p) => p.items);
    const linked = [...goal.links.map((l) => l.topicId), ...planItems.map((i) => i.topicId)].filter((id): id is string => !!id);
    const topicIds = Array.from(new Set(linked));

    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
    const [topics, modules, recent, first, pace] = await Promise.all([
      db.topic.findMany({ where: { userId, id: { in: topicIds }, deletedAt: null }, select: { id: true, status: true } }),
      db.curriculumItem.findMany({ where: { userId, topicId: { in: topicIds }, removed: false }, select: { topicId: true, completed: true, estimatedMinutes: true, kind: true } }),
      db.studyTimeEntry.aggregate({ where: { userId, topicId: { in: topicIds }, startedAt: { gte: since } }, _sum: { seconds: true } }),
      db.studyTimeEntry.aggregate({ where: { userId, topicId: { in: topicIds } }, _min: { startedAt: true } }),
      loadPace(db, userId),
    ]);

    const remaining = remainingWork({ topics, modules, planItems, pace: pace.byKind });
    return NextResponse.json(forecastGoal({
      remainingMinutes: remaining.minutes,
      usedPersonalPace: remaining.usedPersonalPace,
      recentSeconds: recent._sum.seconds ?? 0,
      firstStudiedAt: first._min.startedAt,
      deadline: goal.targetDate,
    }));
  } catch (e) {
    console.error('Failed to forecast goal:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
