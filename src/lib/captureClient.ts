/**
 * Client-side "capture anything" — shared by the Today screen and /notes so
 * both feed the same CaptureItem inbox. A URL gets its title fetched via
 * /api/scrape (best-effort: the capture still saves with just the URL).
 */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

export async function createCapture(rawInput: string, knownTitle?: string | null): Promise<Response> {
  const text = rawInput.trim();
  const isUrl = looksLikeUrl(text);
  let title: string | null = knownTitle?.trim() || null;
  let sourceMeta: unknown = null;

  // A bookmarklet already knows the page title — no need to re-fetch it.
  if (isUrl && !title) {
    try {
      const scrapeRes = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: text }),
      });
      if (scrapeRes.ok) {
        const scraped = await scrapeRes.json();
        title = scraped.title || null;
        sourceMeta = scraped;
      }
    } catch {
      // scrape failing is fine — the capture still saves with just the URL
    }
  }

  return fetch('/api/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText: isUrl ? null : text,
      url: isUrl ? text : null,
      title,
      sourceMeta,
      sourceType: isUrl ? 'article' : 'thought',
    }),
  });
}
