import { describe, expect, it } from 'vitest';
import { buildAssistMessages, cleanAssistInput, cleanChecklistDrafts, mergeChecklist, normalizeAssistReply, searchHref, type ChecklistItem } from './lessonAssist';

describe('cleanAssistInput', () => {
  it('needs a known action and a request', () => {
    expect(cleanAssistInput({ action: 'delete', request: 'x' })).toBeNull();
    expect(cleanAssistInput({ action: 'ask', request: '  ' })).toBeNull();
    expect(cleanAssistInput({ action: 'ask', request: ' why? ', selection: ' part ' })).toEqual({ action: 'ask', request: 'why?', selection: 'part' });
  });
});

describe('normalizeAssistReply', () => {
  it('reads an answer', () => {
    expect(normalizeAssistReply({ type: 'answer', text: 'Because.' }, 'ask')).toEqual({ type: 'answer', text: 'Because.' });
  });

  it('reads a practice list and drops entries with no name', () => {
    const d = normalizeAssistReply({ type: 'practice', items: [{ title: 'Two Sum II', difficulty: 'Medium', url: 'https://leetcode.com/problems/two-sum-ii/' }, { title: '' }] }, 'add');
    expect(d).toMatchObject({ type: 'practice', items: [{ title: 'Two Sum II', difficulty: 'medium' }] });
  });

  it('does not treat an improve request as a practice list', () => {
    expect(normalizeAssistReply({ type: 'practice', items: [{ title: 'x' }] }, 'improve')).toBeNull();
  });

  it('rejects a reply with nothing usable', () => {
    expect(normalizeAssistReply({ type: 'section', heading: 'x' }, 'improve')).toBeNull();
    expect(normalizeAssistReply('nope', 'ask')).toBeNull();
  });
});

describe('cleanChecklistDrafts', () => {
  it('keeps only https links', () => {
    const [a, b, c] = cleanChecklistDrafts([{ title: 'a', url: 'javascript:alert(1)' }, { title: 'b', url: 'http://x.com' }, { title: 'c', url: 'https://x.com/p' }]);
    expect([a.url, b.url, c.url]).toEqual([null, null, 'https://x.com/p']);
  });

  it('removes repeats', () => {
    expect(cleanChecklistDrafts([{ title: '3Sum' }, { title: '3sum' }])).toHaveLength(1);
  });
});

describe('mergeChecklist', () => {
  const existing: ChecklistItem[] = [{ id: '1', title: 'Two Sum II', url: null, platform: null, difficulty: null, why: null, suggested: true, outcome: 'cold', attemptId: 'a1' }];

  it('keeps progress and adds only what is new', () => {
    let n = 1;
    const merged = mergeChecklist(existing, [{ title: 'two sum ii', url: null, platform: null, difficulty: null, why: null }, { title: '3Sum', url: null, platform: null, difficulty: null, why: null }], { suggested: false, newId: () => `n${n++}` });
    expect(merged).toHaveLength(2);
    expect(merged[0].outcome).toBe('cold');
    expect(merged[1]).toMatchObject({ id: 'n1', title: '3Sum', suggested: false, outcome: null });
  });
});

describe('buildAssistMessages', () => {
  const base = { request: 'Find problems', selection: null, topicTitle: 'DSA', moduleTitle: 'Two pointers', learnerLevel: 'beginner', lessonText: 'Lesson body' };

  it('warns against invented links when adding', () => {
    const text = buildAssistMessages({ ...base, action: 'add' }).map((m) => m.content).join(' ');
    expect(text).toContain('an invented one is not');
    expect(text).toContain('"practice"');
  });

  it('includes what was selected', () => {
    expect(buildAssistMessages({ ...base, action: 'ask', selection: 'THE PART' })[1].content).toContain('THE PART');
  });
});

it('builds a search link that includes the site name', () => {
  expect(searchHref({ title: 'Two Sum II', platform: 'LeetCode' })).toContain('LeetCode%20Two%20Sum%20II');
});
