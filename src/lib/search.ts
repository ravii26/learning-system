/** Helpers for searching across everything you've learned. Pure and client-safe. */

export type SearchKind = 'topic' | 'goal' | 'lesson' | 'note' | 'card';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string | null;
  href: string;
}

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  topic: 'Topic', goal: 'Goal', lesson: 'Lesson', note: 'Note', card: 'Review card',
};

export const MIN_QUERY = 2;
const MAX_QUERY = 100;
const SNIPPET_RADIUS = 60;

export const cleanQuery = (raw: string | null): string => (raw ?? '').trim().slice(0, MAX_QUERY);

/** So a typed % or _ means itself in a database pattern. */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export function matches(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.toLowerCase());
}

/** A short piece of the text around the match, or null if it isn't there. */
export function snippetAround(text: string, q: string): string | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return null;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(flat.length, at + q.length + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

/** Every piece of text in a saved lesson, leaving out field names. */
export function flattenStrings(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenStrings).filter(Boolean).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flattenStrings).filter(Boolean).join(' ');
  return '';
}
