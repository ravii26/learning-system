import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { loadTopicKnowledge } from '@/lib/topicKnowledge';

/**
 * Per-module evidence for a topic: the latest quiz and challenge result
 * for each module, how many review cards each module produced, and the
 * knowledge state those add up to (unseen / learning / solid / fading, see
 * lib/moduleState.ts) with a one-line reason. Drives the syllabus colours,
 * the score badges and the Study Room's evidence line.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { id: true } });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const [attempts, cards, knowledge] = await Promise.all([
      db.moduleAttempt.findMany({ where: { userId, topicId: params.id }, orderBy: { createdAt: 'desc' } }),
      db.concept.groupBy({ by: ['sourceModuleId'], where: { topicId: params.id, suspended: false, sourceModuleId: { not: null } }, _count: true }),
      loadTopicKnowledge(userId, [params.id]),
    ]);

    const modules: Record<string, { quiz?: unknown; challenge?: unknown; attempts: number; reviewCards: number; state?: string; reason?: string }> = {};
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
    const k = knowledge.get(params.id);
    if (k?.unit === 'module') {
      for (const item of k.items) {
        const m = (modules[item.id] ??= { attempts: 0, reviewCards: 0 });
        m.state = item.state;
        m.reason = item.reason;
      }
    }

    return NextResponse.json({ modules });
  } catch (e) {
    console.error('Failed to load module attempts:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
