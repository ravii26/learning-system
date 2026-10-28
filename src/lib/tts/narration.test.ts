import { describe, expect, it } from 'vitest';
import { cleanForSpeech, splitForSpeech } from './narration';

describe('cleanForSpeech', () => {
  it('drops markdown marks, code fences and urls', () => {
    expect(cleanForSpeech('**Bold** and `x = 1` see https://a.b/c')).toBe('Bold and x = 1 see link');
    expect(cleanForSpeech('before ```js\nlet a=1\n``` after')).toBe('before after');
    expect(cleanForSpeech('[docs](https://x.y) rock')).toBe('docs rock');
  });
  it('says arrows in words', () => {
    expect(cleanForSpeech('client -> server')).toBe('client to server');
  });
});

describe('splitForSpeech', () => {
  it('keeps short text whole and groups sentences up to the limit', () => {
    expect(splitForSpeech('One. Two. Three.')).toEqual(['One. Two. Three.']);
    expect(splitForSpeech('')).toEqual([]);
  });
  it('never returns a piece over the limit', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const parts = splitForSpeech(long, 100);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
  });
  it('splits one huge sentence at commas or spaces', () => {
    const s = `${'word, '.repeat(100)}end.`;
    const parts = splitForSpeech(s, 80);
    expect(parts.every((p) => p.length <= 80)).toBe(true);
  });
});
