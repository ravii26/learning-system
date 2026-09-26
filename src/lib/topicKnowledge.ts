import { db } from './db';
import {
  cardKnowledge,
  countKnowledge,
  moduleKnowledge,
  type CardEvidence,
  type Knowledge,
  type KnowledgeCounts,
} from './moduleState';

/**
 * Knowledge state for whole topics, from the evidence tables:
 *  - course (syllabus) topics are measured per module;
 *  - every other mode is measured per idea (review card), since there is
 *    no syllabus to finish.
 *
 * `assembleTopicKnowledge` is pure (tested); `loadTopicKnowledge` only
 * fetches rows for it.
 */

export interface KnowledgeItem {
  id: string;
  title: string;
  state: Knowledge;
  reason: string;
}

export interface TopicKnowledge {
  unit: 'module' | 'idea';
  items: KnowledgeItem[];
  counts: KnowledgeCounts;
}

export interface KnowledgeRows {
  topics: Array<{ id: string; mode: string }>;
  modules: Array<{ topicId: string; legacyId: string; title: string; order: number; completed: boolean }>;
  attempts: Array<{ topicId: string; moduleId: string; kind: string; score: number | null; verdict: string | null; createdAt: Date }>;
  cards: Array<CardEvidence & { id: string; topicId: string; title: string; sourceModuleId: string | null }>;
  time: Array<{ topicId: string; moduleId: string | null; seconds: number }>;
}

export function assembleTopicKnowledge(rows: KnowledgeRows, now: Date = new Date()): Map<string, TopicKnowledge> {
  // Newest attempt first, so the first one seen per (module, kind) is the latest.
  const attempts = [...rows.attempts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latest = new Map<string, { score: number | null; verdict: string | null }>();
  for (const a of attempts) {
    const key = `${a.topicId}|${a.moduleId}|${a.kind}`;
    if (!latest.has(key)) latest.set(key, { score: a.score, verdict: a.verdict });
  }

  const seconds = new Map<string, number>();
  for (const t of rows.time) {
    if (!t.moduleId) continue;
    const key = `${t.topicId}|${t.moduleId}`;
    seconds.set(key, (seconds.get(key) ?? 0) + t.seconds);
  }

  const out = new Map<string, TopicKnowledge>();
  for (const topic of rows.topics) {
    const topicCards = rows.cards.filter((c) => c.topicId === topic.id);
    let items: KnowledgeItem[];
    let unit: TopicKnowledge['unit'];

    if (topic.mode === 'syllabus') {
      unit = 'module';
      items = rows.modules
        .filter((m) => m.topicId === topic.id)
        .sort((a, b) => a.order - b.order)
        .map((m) => {
          const result = moduleKnowledge(
            {
              completed: m.completed,
              studySeconds: seconds.get(`${topic.id}|${m.legacyId}`) ?? 0,
              latestQuiz: latest.get(`${topic.id}|${m.legacyId}|quiz`) ?? null,
              latestChallenge: latest.get(`${topic.id}|${m.legacyId}|challenge`) ?? null,
              cards: topicCards.filter((c) => c.sourceModuleId === m.legacyId),
            },
            now
          );
          return { id: m.legacyId, title: m.title, ...result };
        });
    } else {
      unit = 'idea';
      items = topicCards.map((c) => {
        const state = cardKnowledge(c, now);
        const reason =
          state === 'solid' ? 'Recalled at spaced intervals' : state === 'fading' ? 'Slipping — due for review' : 'Not yet recalled at a spaced interval';
        return { id: c.id, title: c.title, state, reason };
      });
    }

    out.set(topic.id, { unit, items, counts: countKnowledge(items.map((i) => i.state)) });
  }
  return out;
}

export async function loadTopicKnowledge(userId: string, topicIds: string[], now: Date = new Date()): Promise<Map<string, TopicKnowledge>> {
  if (topicIds.length === 0) return new Map();
  const where = { userId, topicId: { in: topicIds } };
  const [topics, modules, attempts, cards, time] = await Promise.all([
    db.topic.findMany({ where: { userId, id: { in: topicIds } }, select: { id: true, mode: true } }),
    db.curriculumItem.findMany({
      where: { ...where, removed: false },
      select: { topicId: true, legacyId: true, title: true, order: true, completed: true },
    }),
    db.moduleAttempt.findMany({
      where,
      select: { topicId: true, moduleId: true, kind: true, score: true, verdict: true, createdAt: true },
    }),
    // Concepts still at 'Unknown' are map entries, not review cards.
    db.concept.findMany({
      where: { ...where, suspended: false, masteryLevel: { not: 'Unknown' } },
      select: { id: true, topicId: true, title: true, sourceModuleId: true, state: true, reps: true, stability: true, lastReview: true },
    }),
    db.studyTimeEntry.groupBy({ by: ['topicId', 'moduleId'], where, _sum: { seconds: true } }),
  ]);
  return assembleTopicKnowledge(
    {
      topics,
      modules,
      attempts,
      cards,
      time: time.map((t) => ({ topicId: t.topicId, moduleId: t.moduleId, seconds: t._sum.seconds ?? 0 })),
    },
    now
  );
}
