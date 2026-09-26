import { describe, it, expect } from 'vitest';
import {
  keywordSuggestion,
  parseSuggestions,
  suggestionLabel,
  looksLikeQuestion,
  isSuggestionUsable,
  buildSuggestMessages,
  type TopicForSuggestion,
} from './captureSuggest';

const topics: TopicForSuggestion[] = [
  { id: 't-inv', title: 'Investing', area: 'Finance', mode: 'accretion' },
  { id: 't-sd', title: 'System Design', area: 'Tech', mode: 'syllabus' },
  { id: 't-dsa', title: 'DSA Patterns', area: 'Tech', mode: 'syllabus' },
];

const cap = (rawText: string, extra: Partial<{ title: string; url: string }> = {}) => ({ id: 'c', rawText, title: extra.title ?? null, url: extra.url ?? null });

describe('keywordSuggestion', () => {
  it('files a note under the topic it mentions', () => {
    const s = keywordSuggestion(cap('Investing tip: margin of safety covers errors in your valuation'), topics);
    expect(s).toMatchObject({ action: 'note', topicId: 't-inv', source: 'keywords' });
  });

  it('turns a question about a topic into an open question', () => {
    const s = keywordSuggestion(cap('Why do rate limiters in system design use token buckets?'), topics);
    expect(s).toMatchObject({ action: 'question', topicId: 't-sd' });
  });

  it('keeps an unmatched capture as a plain note', () => {
    expect(keywordSuggestion(cap('Kurzgesagt: how CRISPR edits a gene'), topics)).toMatchObject({ action: 'note', topicId: null });
  });
});

describe('looksLikeQuestion', () => {
  it('spots questions by mark or opening word', () => {
    expect(looksLikeQuestion('token buckets vs fixed windows?')).toBe(true);
    expect(looksLikeQuestion('How does MVCC work')).toBe(true);
    expect(looksLikeQuestion('Moats protect returns.')).toBe(false);
  });
});

describe('parseSuggestions', () => {
  const captures = [cap('Damodaran on valuing young companies'), cap('Why token buckets?'), cap('learn Rust properly'), cap('asdf')];

  it('accepts valid AI suggestions and resolves topic titles', () => {
    const raw = JSON.stringify({
      suggestions: [
        { index: 0, action: 'note', topicId: 't-inv', title: 'Valuing young companies', reason: 'part of your Valuation notes' },
        { index: 1, action: 'question', topicId: 't-sd', title: 'Token buckets', reason: 'question about rate limiting' },
        { index: 2, action: 'topic', topicId: null, title: 'Rust', area: 'Tech', reason: 'a whole subject to study' },
        { index: 3, action: 'archive', topicId: null, title: 'asdf', reason: 'looks like a test' },
      ],
    });
    const out = parseSuggestions(raw, captures, topics);
    expect(out.map((s) => [s.action, s.topicTitle, s.source])).toEqual([
      ['note', 'Investing', 'ai'],
      ['question', 'System Design', 'ai'],
      ['topic', null, 'ai'],
      ['archive', null, 'ai'],
    ]);
    expect(out[2].area).toBe('Tech');
  });

  it('never trusts a topic id that is not yours', () => {
    const raw = JSON.stringify({ suggestions: [{ index: 0, action: 'note', topicId: 'someone-else', title: 'x', reason: 'r' }] });
    expect(parseSuggestions(raw, [captures[0]], topics)[0].topicId).toBeNull();
  });

  it('downgrades a question with no valid topic to a note', () => {
    const raw = JSON.stringify({ suggestions: [{ index: 0, action: 'question', topicId: null, title: 'x', reason: 'r' }] });
    expect(parseSuggestions(raw, [captures[1]], topics)[0].action).toBe('note');
  });

  it('defaults an unknown area to Other', () => {
    const raw = JSON.stringify({ suggestions: [{ index: 0, action: 'topic', title: 'Rust', area: 'Programming', reason: 'r' }] });
    expect(parseSuggestions(raw, [captures[2]], topics)[0].area).toBe('Other');
  });

  it('falls back to keywords for anything missing or malformed', () => {
    const out = parseSuggestions('not json', captures, topics);
    expect(out).toHaveLength(4);
    expect(out.every((s) => s.source === 'keywords')).toBe(true);
    const partial = parseSuggestions(JSON.stringify({ suggestions: [{ index: 1, action: 'teleport' }] }), captures, topics);
    expect(partial[1].source).toBe('keywords');
  });
});

describe('suggestionLabel', () => {
  it('reads like an action', () => {
    expect(suggestionLabel({ action: 'note', topicTitle: 'Investing', title: 'x' })).toBe('Note in Investing');
    expect(suggestionLabel({ action: 'note', topicTitle: null, title: 'x' })).toBe('Keep as a note');
    expect(suggestionLabel({ action: 'question', topicTitle: 'System Design', title: 'x' })).toBe('Question for System Design');
    expect(suggestionLabel({ action: 'topic', topicTitle: null, title: 'Rust' })).toBe('New topic: Rust');
  });
});

describe('isSuggestionUsable', () => {
  it('rejects suggestions pointing at a topic that is gone', () => {
    expect(isSuggestionUsable({ action: 'note', topicId: 't-inv' }, topics)).toBe(true);
    expect(isSuggestionUsable({ action: 'note', topicId: 'deleted' }, topics)).toBe(false);
    expect(isSuggestionUsable(null, topics)).toBe(false);
  });
});

describe('buildSuggestMessages', () => {
  it('lists every topic id and numbers every capture', () => {
    const [system, user] = buildSuggestMessages([cap('a'), cap('b')], topics);
    expect(system.role).toBe('system');
    expect(user.content).toContain('id=t-sd');
    expect(user.content).toContain('[1] text: b');
  });
});

describe('clip', () => {
  it('cuts at a word boundary with an ellipsis', async () => {
    const { clip } = await import('./captureSuggest');
    const out = clip('Why do rate limiters in system design use token buckets instead of fixed windows?', 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('Why do rate limiters in system design…');
    expect(clip('short', 40)).toBe('short');
  });
});
