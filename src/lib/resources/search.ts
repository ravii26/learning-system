/**
 * Optional live search on free tiers. Each adapter is enabled only when its
 * key is set, and every failure returns [] so plans never depend on it.
 * Results are candidates: the caller link-checks them and they stay
 * quality 'unreviewed'.
 */

export interface SearchHit { title: string; url: string; type: 'ARTICLE' | 'COURSE' | 'VIDEO' }

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 8000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const tavilyEnabled = () => Boolean(process.env.TAVILY_API_KEY);
export const youtubeEnabled = () => Boolean(process.env.YOUTUBE_API_KEY);

/** Tavily web search (free tier ~1,000 credits/month). */
export async function searchWeb(query: string, max = 3, fetchImpl: typeof fetch = fetch): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const data = await withTimeout(async (signal) => {
    const res = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: max, search_depth: 'basic' }),
    });
    return res.ok ? ((await res.json()) as { results?: Array<{ title?: string; url?: string }> }) : null;
  });
  return (data?.results ?? [])
    .filter((r) => r.title && r.url && /^https:\/\//.test(r.url))
    .slice(0, max)
    .map((r) => ({ title: r.title!.slice(0, 140), url: r.url!, type: /course|learn|tutorial/i.test(r.title!) ? 'COURSE' : 'ARTICLE' }));
}

/** YouTube Data API search (free daily quota; one search = 100 of 10,000 units). */
export async function searchVideos(query: string, max = 1, fetchImpl: typeof fetch = fetch): Promise<SearchHit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const q = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: String(max), q: query, key, safeSearch: 'strict', relevanceLanguage: 'en' });
  const data = await withTimeout(async (signal) => {
    const res = await fetchImpl(`https://www.googleapis.com/youtube/v3/search?${q}`, { signal });
    return res.ok ? ((await res.json()) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string } }> }) : null;
  });
  return (data?.items ?? [])
    .filter((i) => i.id?.videoId && i.snippet?.title)
    .slice(0, max)
    .map((i) => ({ title: i.snippet!.title!.slice(0, 140), url: `https://www.youtube.com/watch?v=${i.id!.videoId}`, type: 'VIDEO' }));
}

/**
 * Real syllabi / course outlines for a field, to ground an AI-drafted topic
 * list (Tavily, free tier). Returns [] without a key or on any failure.
 */
export async function searchSyllabi(goal: string, fetchImpl: typeof fetch = fetch): Promise<Array<{ title: string; url: string; content: string }>> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const data = await withTimeout(async (signal) => {
    const res = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: `${goal} course syllabus curriculum topics`, max_results: 5, search_depth: 'basic' }),
    });
    return res.ok ? ((await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> }) : null;
  });
  return (data?.results ?? [])
    .filter((r) => r.title && r.url && r.content && /^https:\/\//.test(r.url))
    .slice(0, 5)
    .map((r) => ({ title: r.title!.slice(0, 140), url: r.url!, content: r.content!.slice(0, 1200) }));
}
