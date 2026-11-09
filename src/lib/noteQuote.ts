/**
 * Text selected in a lesson, added to that lesson's notes as a quote.
 * Client-safe: used by both the selection menu and the notes route.
 */

export const MAX_QUOTE_LENGTH = 5000;

/** Where the notes editor keeps an unsaved draft of one module's notes. */
export const moduleNotesDraftKey = (topicId: string, moduleId: string) => `learning-os:notes:${topicId}:${moduleId}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Tidies browser selection text: one line per paragraph, no stray spacing. */
export function cleanSelectedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Plain text in, so nothing selected on a page can become markup in a note. */
export function quoteToHtml(text: string): string {
  const paragraphs = cleanSelectedText(text).split('\n').map((line) => `<p>${escapeHtml(line)}</p>`);
  return `<blockquote>${paragraphs.join('')}</blockquote>`;
}

/** An empty editor still stores `<p></p>`, which should not sit above the first quote. */
export function appendToNotes(existing: string, block: string): string {
  return existing.replace(/<[^>]*>/g, '').trim() ? `${existing}${block}` : block;
}
