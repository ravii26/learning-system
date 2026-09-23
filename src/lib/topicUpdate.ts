import type { Prisma } from '@prisma/client';
import type { TopicPayload } from './validations/topic';

/**
 * Fields a PUT /api/topics/[id] may copy straight from the request body.
 *
 * `status`, `activeSlotType` and `startedDate` are deliberately absent: they
 * are outputs of the status machine in the route, not raw client input.
 */
export const TOPIC_BODY_FIELDS = [
  'title',
  'area',
  'why',
  'depthTarget',
  'progressPct',
  'currentStage',
  'lastCompleted',
  'nextAction',
  'proofOfLearning',
  'notes',
  'topicMode',
  // Json columns, each owned by its own client handler
  'resources',
  'subtasks',
  'contract',
  'knowledgeMap',
  'confusions',
  'mistakes',
  'pauseHistory',
  'sessionLogs',
  'curriculum',
] as const satisfies ReadonlyArray<keyof TopicPayload>;

export interface DerivedTopicFields {
  status: string;
  activeSlotType: string | null;
  startedDate: Date | null;
}

/**
 * Build a Prisma update payload containing ONLY the columns the client sent.
 *
 * Why this exists: the route used to write every column on every request,
 * using the row it had just read as the fallback for anything missing. That
 * turned each PUT into a full-row overwrite, so a concurrent write landing
 * between the read and the update was silently reverted. /api/review/spaced
 * writes `knowledgeMap`, so an unrelated autosave could roll back spaced
 * review scheduling.
 *
 * A key absent from the body means "no opinion" and must leave the column
 * untouched.
 */
export function buildTopicUpdateData(
  body: TopicPayload,
  derived: DerivedTopicFields
): Prisma.TopicUpdateInput {
  const data: Prisma.TopicUpdateInput = {
    status: derived.status,
    activeSlotType: derived.activeSlotType,
    startedDate: derived.startedDate,
  };

  for (const key of TOPIC_BODY_FIELDS) {
    const value = body[key];
    if (value !== undefined) {
      (data as Record<string, unknown>)[key] = value;
    }
  }

  return data;
}
