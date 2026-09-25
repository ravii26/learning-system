import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/**
 * Per-module evidence for a topic: the latest quiz and challenge result
 * for each module, plus how many review cards each module produced. Drives
 * the score badges in the syllabus and the "last attempt" line in the
 * Study Room.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const [attempts, cards] = await Promise.all([
      db.moduleAttempt.findMany({ where: { userId, topicId: params.id }, orderBy: { createdAt: 'desc' } }),
      db.concept.groupBy({ by: ['sourceModuleId'], where: { topicId: params.id, suspended: false, sourceModuleId: { not: null } }, _count: true }),
    ]);

    const modules: Record<string, { quiz?: unknown; challenge?: unknown; attempts: number; reviewCards: number }> = {};
    for (const a of attempts) {
      const m = (modules[a.moduleId] ??= { attempts: 0, reviewCards: 0 });
      m.attempts++;
      const summary = { score: a.score, correct: a.correct, total: a.total, verdict: a.verdict, at: a.createdAt };
      if (a.kind === 'quiz' && !m.quiz) m.quiz = summary;
      if (a.kind === 'challenge' && !m.challenge) m.challenge = summary;
    }
    for (const c of cards) {
      const m = (modules[c.sourceModuleId!] ??= { attempts: 0, reviewCards: 0 });
      m.reviewCards = c._count;
    }

    return NextResponse.json({ modules });
  } catch (e) {
    console.error('Failed to load module attempts:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
