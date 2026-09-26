import { describe, it, expect } from 'vitest';
import { copiedCurriculum, copiedResources } from './planCopy';

describe('copiedCurriculum', () => {
  it('keeps module ids and order, drops progress and notes', () => {
    const out = copiedCurriculum([
      { legacyId: 'b', order: 5, title: 'Second', estimatedMinutes: 40 },
      { legacyId: 'a', order: 2, title: 'First', estimatedMinutes: 25 },
    ]);
    expect(out).toEqual([
      { id: 'a', order: 1, title: 'First', estimatedMinutes: 25, completed: false, completedAt: null, notes: '' },
      { id: 'b', order: 2, title: 'Second', estimatedMinutes: 40, completed: false, completedAt: null, notes: '' },
    ]);
  });
});

describe('copiedResources', () => {
  it('keeps the link and purpose, resets status, drops notes', () => {
    expect(copiedResources([{ title: 'Docs', type: 'WEBSITE', url: 'https://x.dev', purpose: 'reference' }])).toEqual([
      { title: 'Docs', type: 'WEBSITE', url: 'https://x.dev', purpose: 'reference', status: 'NOT_STARTED', notes: '' },
    ]);
  });
});
