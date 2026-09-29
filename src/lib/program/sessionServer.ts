import type { PrismaClient } from '@prisma/client';
import type { CompetencyMap } from '@/data/competencies';
import { callAIContent } from '@/lib/ai/aiClient';
import { toChatPrompt } from '@/lib/ai/manual';
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

/** The next days to write: where to start, with full context (null when nothing is needed or the topic is gone). */
async function nextBatch(db: PrismaClient, userId: string, topicId: string, force = false): Promise<SessionContext | null> {
  const [pending, last] = await Promise.all([
    db.practiceSession.count({ where: { userId, topicId, status: 'pending' } }),
    db.practiceSession.findFirst({ where: { userId, topicId }, orderBy: { day: 'desc' }, select: { day: true } }),
  ]);
  if (pending >= 2 && !force) return null;
  return loadSessionContext(db, userId, topicId, (last?.day ?? 0) + 1);
}

async function saveSessions(db: PrismaClient, userId: string, topicId: string, ctx: SessionContext, raw: string): Promise<{ created: number }> {
  const sessions = parseSessions(raw, ctx.fromDay, ctx.count, ctx.competencies.map((c) => c.key), ctx.minutesPerSession);
  if (!sessions.length) throw new NoUsableSessionsError();
  const res = await db.practiceSession.createMany({
    data: sessions.map((s) => ({ userId, topicId, day: s.day, title: s.title, focus: s.focus, minutes: s.minutes, content: s.content as object })),
    skipDuplicates: true,
  });
  return { created: res.count };
}

export class NoUsableSessionsError extends Error {
  constructor() {
    super('No usable practice days were found. Each day needs a title and at least one step, and must be close to the planned length.');
    this.name = 'NoUsableSessionsError';
  }
}

async function writeUpcomingSessions(db: PrismaClient, userId: string, topicId: string): Promise<{ created: number }> {
  const ctx = await nextBatch(db, userId, topicId);
  if (!ctx) return { created: 0 };
  const { content } = await callAIContent(buildSessionMessages(ctx), { purpose: 'practice.sessions', temperature: 0.5, jsonMode: true, tier: 'content', maxTokens: 12000 });
  return saveSessions(db, userId, topicId, ctx, content);
}

/** "Use my own ChatGPT/Claude": the prompt for the next days (always, even if some are still waiting). */
export async function sessionPrompt(db: PrismaClient, userId: string, topicId: string): Promise<{ prompt: string; fromDay: number } | null> {
  const ctx = await nextBatch(db, userId, topicId, true);
  return ctx ? { prompt: toChatPrompt(buildSessionMessages(ctx)), fromDay: ctx.fromDay } : null;
}

/** Saves the days from a pasted reply. Throws NoUsableSessionsError when nothing in it is usable. */
export async function importSessions(db: PrismaClient, userId: string, topicId: string, json: unknown): Promise<{ created: number }> {
  const ctx = await nextBatch(db, userId, topicId, true);
  if (!ctx) return { created: 0 };
  return saveSessions(db, userId, topicId, ctx, JSON.stringify(json));
}
