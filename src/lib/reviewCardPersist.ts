import type { PrismaClient, Prisma } from '@prisma/client';
import { mirrorConceptsToJson } from './conceptSync';
import { normalizePromptKey, type ReviewCardDraft } from './reviewCards';

type DbClient = PrismaClient | Prisma.TransactionClient;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Saves review-card drafts as Concept rows on a topic, skipping any whose
 * prompt (or, for prompt-less concepts, title) already exists there — so
 * marking a module complete twice, or re-checking a quiz, never duplicates
 * cards. Cards start at Exposed/New and first come due after `dueInDays`
 * (reviewing seconds after reading the answer tests nothing). Keeps
 * Topic.knowledgeMap mirrored, like every other Concept writer.
 */
export async function addReviewCards(
  db: DbClient,
  userId: string,
  topicId: string,
  moduleId: string | null,
  drafts: ReviewCardDraft[],
  {
    dueInDays = 1,
    now = new Date(),
    asKnown,
  }: {
    dueInDays?: number;
    now?: Date;
    /** Seed as already recalled once (placement check): shows as known now, due after `stabilityDays`. */
    asKnown?: { stabilityDays: number };
  } = {}
): Promise<{ added: number; skipped: number }> {
  if (drafts.length === 0) return { added: 0, skipped: 0 };

  const existing = await db.concept.findMany({ where: { topicId, suspended: false }, select: { prompt: true, title: true } });
  const taken = new Set(existing.map((c) => normalizePromptKey(c.prompt || c.title)));

  let added = 0;
  for (const d of drafts) {
    const key = normalizePromptKey(d.prompt);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    await db.concept.create({
      data: {
        userId,
        topicId,
        title: d.title,
        prompt: d.prompt,
        answer: d.answer,
        sourceModuleId: moduleId,
        sourceKind: d.sourceKind,
        ...(asKnown
          ? {
              masteryLevel: 'CanRecall' as const,
              state: 'Review' as const,
              reps: 1,
              stability: asKnown.stabilityDays,
              difficulty: 5,
              lastReview: now,
              scheduledDays: asKnown.stabilityDays,
              nextReview: new Date(now.getTime() + asKnown.stabilityDays * DAY_MS),
            }
          : {
              masteryLevel: 'Exposed' as const, // the due-queue skips Unknown; you've just studied it
              state: 'New' as const,
              nextReview: new Date(now.getTime() + dueInDays * DAY_MS),
            }),
      },
    });
    added++;
  }

  if (added > 0) {
    const mirror = await mirrorConceptsToJson(db, topicId);
    await db.topic.update({ where: { id: topicId }, data: { knowledgeMap: mirror as object } });
  }
  return { added, skipped: drafts.length - added };
}
