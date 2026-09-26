import { describe, it, expect } from 'vitest';
import { findUnownedRef } from './ownership';

// Rows owned by 'me' or 'other'; findFirst matches on id + userId only.
const rows: Record<string, { id: string; userId: string }[]> = {
  topic: [{ id: 't-mine', userId: 'me' }, { id: 't-theirs', userId: 'other' }],
  concept: [{ id: 'c-mine', userId: 'me' }, { id: 'c-theirs', userId: 'other' }],
  skill: [{ id: 's-mine', userId: 'me' }, { id: 's-theirs', userId: 'other' }],
};
const model = (name: string) => ({
  findFirst: async ({ where }: any) => rows[name].find((r) => r.id === where.id && r.userId === where.userId) ?? null,
});
const db = { topic: model('topic'), concept: model('concept'), skill: model('skill') } as any;

describe('findUnownedRef', () => {
  it('passes when every referenced row is yours', async () => {
    expect(await findUnownedRef(db, 'me', { topicId: 't-mine', conceptId: 'c-mine', skillId: 's-mine' })).toBeNull();
  });

  it('treats absent, null and empty as unlinking, not a violation', async () => {
    expect(await findUnownedRef(db, 'me', {})).toBeNull();
    expect(await findUnownedRef(db, 'me', { topicId: null, skillId: '' })).toBeNull();
  });

  it("flags another user's row", async () => {
    expect(await findUnownedRef(db, 'me', { skillId: 's-theirs' })).toBe('skillId');
    expect(await findUnownedRef(db, 'me', { topicId: 't-mine', conceptId: 'c-theirs' })).toBe('conceptId');
    expect(await findUnownedRef(db, 'other', { topicId: 't-mine' })).toBe('topicId');
  });

  it('flags ids that do not exist at all', async () => {
    expect(await findUnownedRef(db, 'me', { topicId: 'nope' })).toBe('topicId');
  });

  it('rejects non-string ids (e.g. a Prisma filter object smuggled in)', async () => {
    expect(await findUnownedRef(db, 'me', { skillId: { not: null } })).toBe('skillId');
  });
});
