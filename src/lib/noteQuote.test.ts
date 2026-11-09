import { describe, expect, it } from 'vitest';
import { appendToNotes, cleanSelectedText, quoteToHtml } from './noteQuote';
import { queueNoteWork } from './noteAutosave';

describe('cleanSelectedText', () => {
  it('collapses browser selection spacing into one line per paragraph', () => {
    expect(cleanSelectedText('  Two  pointers\r\n\r\n   move inward \n')).toBe('Two pointers\nmove inward');
  });
});

describe('quoteToHtml', () => {
  it('makes one paragraph per line inside a quote', () => {
    expect(quoteToHtml('one\ntwo')).toBe('<blockquote><p>one</p><p>two</p></blockquote>');
  });

  it('escapes selected text so it cannot become markup', () => {
    expect(quoteToHtml('a < b <img src=x onerror="y">')).toBe('<blockquote><p>a &lt; b &lt;img src=x onerror=&quot;y&quot;&gt;</p></blockquote>');
  });
});

describe('appendToNotes', () => {
  const block = '<blockquote><p>q</p></blockquote>';

  it('adds after existing notes', () => {
    expect(appendToNotes('<p>mine</p>', block)).toBe(`<p>mine</p>${block}`);
  });

  it('replaces an empty editor value', () => {
    expect(appendToNotes('<p></p>', block)).toBe(block);
    expect(appendToNotes('', block)).toBe(block);
  });
});

describe('queueNoteWork', () => {
  it('runs in order and continues after a failure', async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = queueNoteWork('quote-note', () => new Promise<void>((resolve) => { release = () => { order.push('first'); resolve(); }; }));
    const second = queueNoteWork('quote-note', async () => { order.push('second'); throw new Error('no'); });
    const third = queueNoteWork('quote-note', async () => { order.push('third'); return 3; });
    await Promise.resolve();
    await Promise.resolve();
    release();
    await first;
    await expect(second).rejects.toThrow('no');
    await expect(third).resolves.toBe(3);
    expect(order).toEqual(['first', 'second', 'third']);
  });
});
