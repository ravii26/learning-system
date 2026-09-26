import type { DbClient } from './masteryRecompute';

export interface ForeignRefs {
  topicId?: unknown;
  conceptId?: unknown;
  skillId?: unknown;
}

/**
 * Checks that every id a client sent to link a row to (topic, concept,
 * skill) belongs to this user. Returns the first offending field name, or
 * null when all are fine. Absent/null/empty values are "unlink" and pass.
 *
 * Without this a user could attach their row to someone else's — e.g. a
 * topic pointing at another user's skill would make that skill's mastery
 * get recomputed (and overwritten) from the wrong user's evidence.
 */
export async function findUnownedRef(db: DbClient, userId: string, refs: ForeignRefs): Promise<keyof ForeignRefs | null> {
  const id = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const checks: [keyof ForeignRefs, () => Promise<unknown>][] = [];
  const topicId = id(refs.topicId);
  const conceptId = id(refs.conceptId);
  const skillId = id(refs.skillId);
  if (topicId) checks.push(['topicId', () => db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } })]);
  if (conceptId) checks.push(['conceptId', () => db.concept.findFirst({ where: { id: conceptId, userId }, select: { id: true } })]);
  if (skillId) checks.push(['skillId', () => db.skill.findFirst({ where: { id: skillId, userId }, select: { id: true } })]);
  for (const [field, find] of checks) {
    if (!(await find())) return field;
  }
  // A non-string, non-empty value (object, number) is never a valid id.
  for (const field of ['topicId', 'conceptId', 'skillId'] as const) {
    const v = refs[field];
    if (v !== undefined && v !== null && v !== '' && typeof v !== 'string') return field;
  }
  return null;
}

export const unownedRefError = (field: string) => `${field} does not reference anything you own`;
