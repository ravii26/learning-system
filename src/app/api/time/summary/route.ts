import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { summarizeStudyTime } from '@/lib/timeSummary';

/**
 * "How much time did I actually give": a per-day series over the last
 * `days` days (in your local time — pass `tz` = Date.getTimezoneOffset()),
 * per-topic totals, and — with topicId — that topic's all-time total.
 */
export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(1, Number(searchParams.get('days')) || 7));
    const tz = Number(searchParams.get('tz'));
    const tzOffsetMinutes = Number.isFinite(tz) && Math.abs(tz) <= 14 * 60 ? tz : 0;
    const topicId = searchParams.get('topicId');

    const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
    const where = { userId, topic: { deletedAt: null }, ...(topicId ? { topicId } : {}) };

    const [entries, allTime] = await Promise.all([
      db.studyTimeEntry.findMany({ where: { ...where, startedAt: { gte: since } }, select: { topicId: true, startedAt: true, seconds: true } }),
      db.studyTimeEntry.aggregate({ where, _sum: { seconds: true } }),
    ]);

    const summary = summarizeStudyTime(entries, { days, tzOffsetMinutes });
    const topics = await db.topic.findMany({
      where: { userId, id: { in: summary.byTopic.map((t) => t.topicId) } },
      select: { id: true, title: true },
    });
    const titles = new Map(topics.map((t) => [t.id, t.title]));

    return NextResponse.json({
      ...summary,
      byTopic: summary.byTopic.map((t) => ({ ...t, title: titles.get(t.topicId) ?? 'Topic' })),
      allTimeSeconds: allTime._sum.seconds ?? 0,
    });
  } catch (e) {
    console.error('Failed to summarize study time:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
