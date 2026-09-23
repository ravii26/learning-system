import { describe, it, expect } from 'vitest';
import { extractWikilinkTitles } from './noteLinkSync';

describe('extractWikilinkTitles', () => {
  it('returns nothing for plain text with no links', () => {
    expect(extractWikilinkTitles('Just a regular note about margins of safety.')).toEqual([]);
  });

  it('extracts a single wikilink', () => {
    expect(extractWikilinkTitles('See [[Intrinsic Value]] for more.')).toEqual(['Intrinsic Value']);
  });

  it('extracts multiple distinct wikilinks', () => {
    const titles = extractWikilinkTitles('Related to [[Intrinsic Value]] and [[Economic Moats]].');
    expect(titles).toEqual(['Intrinsic Value', 'Economic Moats']);
  });

  it('de-duplicates repeated references', () => {
    const titles = extractWikilinkTitles('[[Margin of Safety]] is key. Revisit [[Margin of Safety]] later.');
    expect(titles).toEqual(['Margin of Safety']);
  });

  it('trims whitespace inside the brackets', () => {
    expect(extractWikilinkTitles('[[  Padded Title  ]]')).toEqual(['Padded Title']);
  });

  it('ignores an empty [[]] reference', () => {
    expect(extractWikilinkTitles('[[]]')).toEqual([]);
  });

  it('works inside HTML (TipTap output), not just plain text', () => {
    const html = '<p>Notes on <strong>[[Valuation]]</strong> methods.</p>';
    expect(extractWikilinkTitles(html)).toEqual(['Valuation']);
  });

  it('does not treat a single bracket pair as a wikilink', () => {
    expect(extractWikilinkTitles('An array literal like [1, 2, 3] is not a link.')).toEqual([]);
  });

  it('does not greedily span across two separate wikilinks', () => {
    // A naive `\[\[(.*)\]\]` would capture "A]] text [[B" as one match.
    const titles = extractWikilinkTitles('[[A]] text [[B]]');
    expect(titles).toEqual(['A', 'B']);
  });

  it('handles many links without pathological slowdown', () => {
    const body = Array.from({ length: 200 }, (_, i) => `[[Note ${i}]]`).join(' ');
    const titles = extractWikilinkTitles(body);
    expect(titles.length).toBe(200);
  });
});
