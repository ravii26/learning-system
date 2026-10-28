/**
 * Turns a rendered lesson into short pieces of speech. Each piece keeps the
 * element it came from, so the player can highlight what is being read.
 * Code, diagrams and tables are skipped: read aloud they are noise, so the
 * listener is told to look at the screen instead.
 */

export interface NarrationPart {
  text: string;
  el: HTMLElement | null;
}

/** Longest piece sent to the voice model in one go; longer text is split at sentence ends. */
export const MAX_PART_CHARS = 280;

const READABLE = 'h2,h3,h4,p,li,blockquote,figcaption,summary';
const SKIPPED = 'pre,svg,table,button,script,style,[aria-hidden="true"],[data-no-tts]';

export function cleanForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/\s*->\s*/g, ' to ')
    .replace(/\s*=>\s*/g, ' gives ')
    .replace(/[*_#>~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits at sentence ends, then at commas or spaces if a sentence is still too long. */
export function splitForSpeech(text: string, max = MAX_PART_CHARS): string[] {
  const t = text.trim();
  if (!t) return [];
  const sentences = t.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [t];
  const out: string[] = [];
  let buf = '';
  const push = (s: string) => { if (s.trim()) out.push(s.trim()); };
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > max) {
      push(buf); buf = '';
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(', ', max);
        if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
        if (cut <= 0) cut = max;
        push(rest.slice(0, cut + 1));
        rest = rest.slice(cut + 1);
      }
      buf = rest;
    } else if (buf && buf.length + 1 + s.length > max) {
      push(buf); buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  push(buf);
  return out;
}

/** Pieces with something sayable in them. A line of only symbols is dropped. */
function sayable(text: string): boolean {
  return /[a-z0-9\u00C0-\uFFFF]/i.test(text);
}

export function buildNarration(root: HTMLElement | null, intro: string[] = []): NarrationPart[] {
  const parts: NarrationPart[] = [];
  for (const line of intro) {
    for (const text of splitForSpeech(cleanForSpeech(line))) if (sayable(text)) parts.push({ text, el: null });
  }
  if (!root) return parts;
  root.querySelectorAll<HTMLElement>(READABLE).forEach((el) => {
    if (el.closest(SKIPPED)) return;
    if (el.querySelector(READABLE)) return; // read the inner paragraph/item, not its wrapper
    const text = cleanForSpeech(el.innerText || el.textContent || '');
    if (!sayable(text)) return;
    const pieces = splitForSpeech(text);
    // Headings get a full stop so the voice pauses after them.
    pieces.forEach((p, i) => {
      const heading = /^H[2-4]$/.test(el.tagName) && i === pieces.length - 1 && !/[.!?:]$/.test(p);
      parts.push({ text: heading ? `${p}.` : p, el });
    });
  });
  return parts;
}
