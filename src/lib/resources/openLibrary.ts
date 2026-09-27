/**
 * Checks that a book the AI named actually exists, using Open Library's free
 * search API (no key). A match turns an AI-named title into a real link; no
 * match means the title is dropped rather than shown.
 */

export const normalizeTitle = (t: string) =>
  t.toLowerCase()
    .split(/\s*[:([—–]|\s-\s/)[0]      // main title only: drop subtitles and "(Author)"
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Same book? Main titles must match exactly after normalising. */
export function titlesMatch(asked: string, found: string): boolean {
  const a = normalizeTitle(asked);
  const b = normalizeTitle(found);
  return a.length >= 3 && a === b;
}

export interface FoundBook { title: string; author: string | null; year: number | null; url: string }

export async function findBook(title: string, fetchImpl: typeof fetch = fetch): Promise<FoundBook | null> {
  const q = new URLSearchParams({ title: normalizeTitle(title), limit: '5', fields: 'key,title,author_name,first_publish_year' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetchImpl(`https://openlibrary.org/search.json?${q}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as { docs?: Array<{ key?: string; title?: string; author_name?: string[]; first_publish_year?: number }> };
    const doc = (data.docs ?? []).find((d) => d.key && d.title && titlesMatch(title, d.title));
    if (!doc) return null;
    return {
      title: doc.title!,
      author: doc.author_name?.[0] ?? null,
      year: doc.first_publish_year ?? null,
      url: `https://openlibrary.org${doc.key}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
