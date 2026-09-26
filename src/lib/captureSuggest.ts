import type { AIMessage } from './ai/aiClient';
import { VALID_AREAS } from './validations/topic';

/**
 * A suggested home for each inbox capture, so sorting the inbox is one tap
 * per item instead of a decision plus a dropdown. The AI proposes; these
 * pure helpers build its prompt, validate what it returns against your
 * real topics, and fall back to plain keyword matching when the AI is
 * unavailable. Nothing is moved until you accept.
 */

export type SuggestedAction = 'note' | 'question' | 'topic' | 'archive';

export interface CaptureSuggestion {
  action: SuggestedAction;
  topicId: string | null;
  topicTitle: string | null;
  /** Clean title for the note or new topic. */
  title: string;
  /** Area for a new topic. */
  area: string | null;
  /** Why this home, in a few plain words. */
  reason: string;
  source: 'ai' | 'keywords';
}

export interface CaptureForSuggestion {
  id: string;
  title: string | null;
  rawText: string | null;
  url: string | null;
}

export interface TopicForSuggestion {
  id: string;
  title: string;
  area: string;
  mode: string;
}

export const AREAS = VALID_AREAS;
export const MAX_PER_AI_CALL = 10;

const STOPWORDS = new Set([
  'about', 'after', 'also', 'and', 'from', 'have', 'into', 'just', 'like', 'more', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'while', 'with', 'your', 'learn', 'learning',
  'basics', 'intro', 'introduction', 'patterns', 'skills', 'the', 'for',
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

const captureText = (c: CaptureForSuggestion) => [c.title, c.rawText, c.url].filter(Boolean).join(' ');

/** Shortens at a word boundary, with an ellipsis, never mid-word. */
export function clip(text: string, max = 70): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ') > max * 0.5 ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  return `${atWord.replace(/[\s,;:.-]+$/, '')}…`;
}

export function cleanTitle(c: CaptureForSuggestion, max = 70): string {
  return clip(c.title || c.rawText || c.url || 'Untitled', max);
}

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.endsWith('?') || /^(why|how|what|when|which|is|are|does|do|can|should)\b/.test(t);
}

export function suggestionLabel(s: Pick<CaptureSuggestion, 'action' | 'topicTitle' | 'title'>): string {
  switch (s.action) {
    case 'note':
      return s.topicTitle ? `Note in ${s.topicTitle}` : 'Keep as a note';
    case 'question':
      return `Question for ${s.topicTitle}`;
    case 'topic':
      return `New topic: ${s.title}`;
    case 'archive':
      return 'Archive';
  }
}

/** The topic whose title words appear most in the capture, if any. */
export function matchTopic(c: CaptureForSuggestion, topics: TopicForSuggestion[]): TopicForSuggestion | null {
  const text = new Set(words(captureText(c)));
  let best: TopicForSuggestion | null = null;
  let bestScore = 0;
  for (const t of topics) {
    const score = words(t.title).filter((w) => text.has(w)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

export function keywordSuggestion(c: CaptureForSuggestion, topics: TopicForSuggestion[]): CaptureSuggestion {
  const topic = matchTopic(c, topics);
  const title = cleanTitle(c);
  if (topic && looksLikeQuestion(c.rawText || c.title || '')) {
    return { action: 'question', topicId: topic.id, topicTitle: topic.title, title, area: null, reason: `an open question about ${topic.title}`, source: 'keywords' };
  }
  if (topic) {
    return { action: 'note', topicId: topic.id, topicTitle: topic.title, title, area: null, reason: `mentions ${topic.title}`, source: 'keywords' };
  }
  return { action: 'note', topicId: null, topicTitle: null, title, area: null, reason: 'no matching topic yet', source: 'keywords' };
}

export function buildSuggestMessages(captures: CaptureForSuggestion[], topics: TopicForSuggestion[]): AIMessage[] {
  const topicLines = topics.length
    ? topics.map((t) => `- id=${t.id} | ${t.title} | area: ${t.area} | ${t.mode === 'syllabus' ? 'course' : t.mode === 'accretion' ? 'ideas collected over time' : t.mode}`).join('\n')
    : '(no topics yet)';
  const captureLines = captures
    .map((c, i) => `[${i}] ${[c.title && `title: ${c.title}`, c.rawText && `text: ${c.rawText}`, c.url && `link: ${c.url}`].filter(Boolean).join(' | ')}`)
    .join('\n');

  const system = `You sort a learner's quick captures into their personal learning system. For each capture pick ONE home:
- "question": the capture is a question they want answered, and it clearly belongs to one listed topic. It becomes an open question on that topic, which their next lesson will address.
- "note": an idea, fact, quote, tip or link worth keeping. Set topicId when it clearly belongs to one listed topic; otherwise null.
- "topic": only when the capture names a whole subject they want to study (e.g. "learn Rust"), not a single idea. area must be exactly one of: ${AREAS.join(', ')} (programming and software are Tech; money and markets are Finance).
- "archive": only for empty, test or meaningless captures.
Use only topic ids from the list. When unsure, prefer "note" with topicId null.
title: for "topic", only the subject's name (e.g. "Rust"). Otherwise a short heading of 3 to 8 words naming the idea (e.g. "Valuing young companies: story first"), never the whole capture copied.
reason: at most 8 plain words saying why this home, e.g. "part of your Valuation notes" or "question about rate limiting".
Return JSON only: {"suggestions":[{"index":0,"action":"note","topicId":"…or null","title":"…","area":null,"reason":"…"}]}`;

  const user = `Topics:\n${topicLines}\n\nCaptures:\n${captureLines}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Validates the AI's answer against the real captures and topics. Any
 * capture it skipped or got wrong falls back to keyword matching, so every
 * capture always gets a usable suggestion.
 */
export function parseSuggestions(raw: string, captures: CaptureForSuggestion[], topics: TopicForSuggestion[]): CaptureSuggestion[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  let list: unknown[] = [];
  try {
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  } catch {
    list = [];
  }
  const byIndex = new Map<number, Record<string, unknown>>();
  for (const item of list) {
    if (item && typeof item === 'object' && Number.isInteger((item as { index?: unknown }).index)) {
      byIndex.set((item as { index: number }).index, item as Record<string, unknown>);
    }
  }

  return captures.map((c, i) => {
    const s = byIndex.get(i);
    const fallback = keywordSuggestion(c, topics);
    if (!s) return fallback;

    const action = s.action as SuggestedAction;
    if (!['note', 'question', 'topic', 'archive'].includes(action)) return fallback;
    const topic = typeof s.topicId === 'string' ? byId.get(s.topicId) ?? null : null;
    const title = typeof s.title === 'string' && s.title.trim() ? clip(s.title) : cleanTitle(c);
    const reason = typeof s.reason === 'string' && s.reason.trim() ? s.reason.trim().slice(0, 80) : fallback.reason;

    if (action === 'question' && !topic) {
      // A question needs a topic to live on; without one it's still worth keeping.
      return { action: 'note', topicId: null, topicTitle: null, title, area: null, reason, source: 'ai' };
    }
    if (action === 'topic') {
      const area = typeof s.area === 'string' && AREAS.includes(s.area) ? s.area : 'Other';
      return { action, topicId: null, topicTitle: null, title, area, reason, source: 'ai' };
    }
    return {
      action,
      topicId: action === 'archive' ? null : topic?.id ?? null,
      topicTitle: action === 'archive' ? null : topic?.title ?? null,
      title,
      area: null,
      reason,
      source: 'ai',
    };
  });
}

/** A stored suggestion is stale once its topic is gone (deleted or dropped). */
export function isSuggestionUsable(s: unknown, topics: TopicForSuggestion[]): s is CaptureSuggestion {
  if (!s || typeof s !== 'object') return false;
  const v = s as Partial<CaptureSuggestion>;
  if (!v.action || !['note', 'question', 'topic', 'archive'].includes(v.action)) return false;
  if (v.topicId && !topics.some((t) => t.id === v.topicId)) return false;
  if (v.action === 'question' && !v.topicId) return false;
  return true;
}
