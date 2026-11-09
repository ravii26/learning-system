import { describe, expect, it } from 'vitest';
import { cleanQuery, escapeLike, flattenStrings, matches, snippetAround } from './search';

describe('snippetAround', () => {
  it('shows text around the match, ignoring case', () => {
    expect(snippetAround('Move the LEFT pointer right', 'left')).toBe('Move the LEFT pointer right');
  });

  it('marks text cut from either end', () => {
    const s = snippetAround(`${'a '.repeat(100)}target${' b'.repeat(100)}`, 'target')!;
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('target');
  });

  it('returns null when it is not there', () => {
    expect(snippetAround('nothing here', 'target')).toBeNull();
  });
});

describe('flattenStrings', () => {
  it('collects text but not field names', () => {
    const text = flattenStrings({ explanation: 'alpha', quiz: [{ question: 'beta', correctIndex: 1 }] });
    expect(text).toBe('alpha beta');
    expect(matches(text, 'explanation')).toBe(false);
  });
});

it('escapes pattern characters', () => {
  expect(escapeLike('100%_a\\')).toBe('100\\%\\_a\\\\');
});

it('trims and caps the query', () => {
  expect(cleanQuery('  two  ')).toBe('two');
  expect(cleanQuery(null)).toBe('');
  expect(cleanQuery('x'.repeat(500))).toHaveLength(100);
});
