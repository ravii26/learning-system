import { describe, it, expect } from 'vitest';
import { htmlToText } from './htmlText';

describe('htmlToText', () => {
  it('is empty for nothing', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText('<p></p>')).toBe('');
  });

  it('keeps paragraphs and list items, drops tags, decodes entities', () => {
    const html = '<p>Shrink <strong>left</strong> when invalid &amp; repeat.</p><ul><li><p>O(n)</p></li><li>no negatives</li></ul>';
    expect(htmlToText(html)).toBe('Shrink left when invalid & repeat.\n• O(n)\n• no negatives');
  });

  it('truncates long notes', () => {
    const out = htmlToText(`<p>${'a'.repeat(50)}</p>`, 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
});
