import type { PrismaClient } from '@prisma/client';
import type { CompetencyMap } from '@/data/competencies';
import { callAIContent } from '@/lib/ai/aiClient';
import { guessArchetype, isArchetype } from './fieldGuide';
import { buildSessionMessages, minutesPerSession, parseSessions, SESSION_BATCH, type SessionContext, type SessionHistory } from './sessions';
import type { Intake } from './types';

/** Everything the session writer needs about this practice topic and how it has gone. */
export async function loadSessionContext(db: PrismaClient, userId: string, topicId: string, fromDay: number): Promise<SessionContext | null> {
  const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { title: true, why: true, contract: true } });
  if (!topic) return null;
  const [item, past] = await Promise.all([
    db.programItem.findFirst({
      where: { userId, topicId, program: { status: 'active' } },
      select: { competencyKeys: true, hoursPerWeek: true, program: { select: { competencyMap: true, intake: true } } },
    }),
    db.practiceSession.findMany({ where: { userId, topicId }, orderBy: { day: 'asc' }, select: { day: true, title: true, status: true, rating: true, notes: true, results: true } }),
  ]);

  const history: SessionHistory[] = past.map((s) => ({
    day: s.day, title: s.title, status: s.status, rating: s.rating, notes: s.notes,
    feedback: feedbackOf(s.results),
  }));
  const level = String((topic.contract as { currentLevel?: string } | null)?.currentLevel ?? 'Beginner');

  if (item) {
    const map = item.program.competencyMap as unknown as CompetencyMap;
    const intake = item.program.intake as unknown as Intake;
    return {
      archetype: isArchetype(map.archetype) ? map.archetype : isArchetype(intake.archetype) ? intake.archetype : guessArchetype(`${map.title} ${intake.goal}`),
      field: map.title,
      goal: intake.doneMeans || intake.goal,
      level,
      answers: intake.answers ?? [],
      topicTitle: topic.title,
      competencies: item.competencyKeys
        .map((k) => map.competencies?.find((c) => c.key === k))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => ({ key: c.key, title: c.title, summary: c.summary, drills: c.lessons ?? [] })),
      minutesPerSession: minutesPerSession(item.hoursPerWeek),
      fromDay, count: SESSION_BATCH, history,
    };
  }
  // A practice topic made by hand: its title is all there is.
  return {
    archetype: guessArchetype(topic.title),
    field: topic.title,
    goal: topic.why || topic.title,
    level,
    answers: [],
    topicTitle: topic.title,
    competencies: [{ key: 'main', title: topic.title, summary: topic.why || `Get better at ${topic.title}`, drills: [] }],
    minutesPerSession: 20,
    fromDay, count: SESSION_BATCH, history,
  };
}

/** Mistakes the AI pointed out in a finished session's checked answers, to recycle them later. */
function feedbackOf(results: unknown): string[] {
  const r = results as { checks?: Array<{ verdict?: string; feedback?: string }> } | null;
  return (r?.checks ?? []).filter((c) => c.verdict && c.verdict !== 'correct' && c.feedback).map((c) => c.feedback!.slice(0, 160)).slice(0, 5);
}

/**
 * Writes the next few days when fewer than two are waiting. Safe to call
 * twice at once: days are unique per topic, so a race only wastes a call.
 */
const preparing = new Map<string, Promise<{ created: number }>>();

export function ensureUpcomingSessions(db: PrismaClient, userId: string, topicId: string): Promise<{ created: number }> {
  // Two requests at once (button + automatic refill) share one AI call.
  const key = `${userId}:${topicId}`;
  const running = preparing.get(key);
  if (running) return running;
  const job = writeUpcomingSessions(db, userId, topicId).finally(() => preparing.delete(key));
  preparing.set(key, job);
  return job;
}

async function writeUpcomingSessions(db: PrismaClient, userId: string, topicId: string): Promise<{ created: number }> {
  const [pending, last] = await Promise.all([
    db.practiceSession.count({ where: { userId, topicId, status: 'pending' } }),
    db.practiceSession.findFirst({ where: { userId, topicId }, orderBy: { day: 'desc' }, select: { day: true } }),
  ]);
  if (pending >= 2) return { created: 0 };
  const fromDay = (last?.day ?? 0) + 1;
  const ctx = await loadSessionContext(db, userId, topicId, fromDay);
  if (!ctx) return { created: 0 };

  const { content } = await callAIContent(buildSessionMessages(ctx), { purpose: 'practice.sessions', temperature: 0.5, jsonMode: true, tier: 'content', maxTokens: 12000 });
  const sessions = parseSessions(content, fromDay, ctx.count, ctx.competencies.map((c) => c.key), ctx.minutesPerSession);
  if (!sessions.length) throw new Error('The AI returned no usable sessions.');
  const res = await db.practiceSession.createMany({
    data: sessions.map((s) => ({ userId, topicId, day: s.day, title: s.title, focus: s.focus, minutes: s.minutes, content: s.content as object })),
    skipDuplicates: true,
  });
  return { created: res.count };
}
