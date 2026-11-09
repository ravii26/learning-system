import type { AIMessage } from '@/lib/ai/aiClient';
import type { ProblemOutcome } from './problems';

/**
 * Ask, Add or Improve inside a lesson. The AI returns data only; everything
 * is checked here before it can be shown or saved. Client-safe.
 */

export type AssistAction = 'ask' | 'add' | 'improve';

export interface ChecklistDraft {
  title: string;
  url: string | null;
  platform: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  why: string | null;
}

export interface ChecklistItem extends ChecklistDraft {
  id: string;
  /** True for something the AI suggested, whose link can't be confirmed. */
  suggested: boolean;
  outcome: ProblemOutcome | null;
  attemptId: string | null;
}

export type AssistDraft =
  | { type: 'answer'; text: string }
  | { type: 'section'; heading: string; body: string }
  | { type: 'practice'; heading: string; items: ChecklistDraft[] };

export const ASSIST_PRESETS: Record<'add' | 'improve', Array<{ label: string; request: string }>> = {
  add: [
    { label: 'Practice problems', request: 'Find 3 practice problems for this lesson, from a well-known site for this subject.' },
    { label: 'An example', request: 'Add one more worked example.' },
    { label: 'Resources', request: 'Suggest a few good resources for going further, and say what each is for.' },
    { label: 'A diagram', request: 'Add a simple diagram of the main idea, drawn in plain text inside a code block.' },
    { label: 'More questions', request: 'Add 5 self-test questions, each followed by its answer.' },
  ],
  improve: [
    { label: 'Simpler', request: 'Explain this more simply, in everyday language.' },
    { label: 'Deeper', request: 'Go deeper: explain why it works and what is usually left out.' },
    { label: 'Shorter', request: 'Give me the short version: only what matters most.' },
    { label: 'Another example', request: 'Explain this again using a different, concrete example.' },
    { label: 'This is wrong', request: 'I think part of this is wrong. Check it carefully, say plainly whether it is, and give the correct version.' },
  ],
};

const MAX_REQUEST = 1000;
const MAX_SELECTION = 3000;
const MAX_LESSON_TEXT = 9000;
const MAX_HEADING = 120;
const MAX_BODY = 14_000;
const MAX_ITEMS = 12;
const MAX_ITEM_TEXT = 200;
const MAX_WHY = 300;

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function cleanAssistInput(body: Record<string, unknown>): { action: AssistAction; request: string; selection: string | null } | null {
  const action = body.action;
  if (action !== 'ask' && action !== 'add' && action !== 'improve') return null;
  const request = text(body.request, MAX_REQUEST);
  if (!request) return null;
  return { action, request, selection: text(body.selection, MAX_SELECTION) };
}

/** The readable parts of a saved lesson, so the AI answers about this lesson. */
export function lessonTextForAssist(content: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ['summary', 'explanation', 'codeOrExample']) {
    if (typeof content[key] === 'string') parts.push(content[key] as string);
  }
  if (Array.isArray(content.keyTakeaways)) parts.push((content.keyTakeaways as unknown[]).filter((x) => typeof x === 'string').join('\n'));
  if (Array.isArray(content.blocks) && content.blocks.length) parts.push(JSON.stringify(content.blocks));
  return parts.join('\n\n').slice(0, MAX_LESSON_TEXT);
}

const RESULT_SHAPE: Record<AssistAction, string> = {
  ask: `Return JSON only: { "type": "answer", "text": "<your answer in markdown>" }`,
  improve: `Return JSON only: { "type": "section", "heading": "<short title>", "body": "<markdown>" }`,
  add: `Return JSON only, in ONE of these two shapes.
For practice problems or exercises on outside sites:
{ "type": "practice", "heading": "Practice problems", "items": [ { "title": "<exact name of the problem>", "platform": "<site, e.g. LeetCode>", "url": "<exact https link, or empty>", "difficulty": "easy" | "medium" | "hard", "why": "<one sentence on what this one practises>" } ] }
For anything else:
{ "type": "section", "heading": "<short title>", "body": "<markdown>" }`,
};

export function buildAssistMessages(input: {
  action: AssistAction;
  request: string;
  selection: string | null;
  topicTitle: string;
  moduleTitle: string;
  learnerLevel: string;
  lessonText: string;
}): AIMessage[] {
  const honesty = input.action === 'add'
    ? `Only name real problems or resources you are confident exist, using their exact names. Leave "url" empty unless you are sure of the exact link: a missing link is fine, an invented one is not. Never invent facts, sources or statistics.`
    : `Answer from what is true, not only from what the lesson says. If the lesson is wrong or you are unsure, say so plainly. Never invent facts, sources or statistics.`;
  return [
    { role: 'system', content: `You help one learner with a lesson they are reading. Be direct and concrete, and match their level. ${honesty}` },
    {
      role: 'user',
      content: `Subject: ${input.topicTitle}
Lesson: ${input.moduleTitle}
Learner's level: ${input.learnerLevel}

The lesson so far:
"""
${input.lessonText}
"""
${input.selection ? `\nThe part they selected:\n"""\n${input.selection}\n"""\n` : ''}
What they want: ${input.request}

${RESULT_SHAPE[input.action]}`,
    },
  ];
}

function safeLink(v: unknown): string | null {
  const raw = text(v, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const difficultyOf = (v: unknown): ChecklistDraft['difficulty'] => {
  const d = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return d === 'easy' || d === 'medium' || d === 'hard' ? d : null;
};

export function cleanChecklistDrafts(raw: unknown): ChecklistDraft[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ChecklistDraft[] = [];
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const title = text(e.title, MAX_ITEM_TEXT);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title, url: safeLink(e.url), platform: text(e.platform, 60), difficulty: difficultyOf(e.difficulty), why: text(e.why, MAX_WHY) });
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

export function cleanSection(raw: Record<string, unknown>): { heading: string; body: string } | null {
  const body = text(raw.body, MAX_BODY);
  if (!body) return null;
  return { heading: text(raw.heading, MAX_HEADING) ?? 'Added to this lesson', body };
}

/** Whatever the AI or a pasted chat reply gave us, as something safe to show, or null. */
export function normalizeAssistReply(raw: unknown, action: AssistAction): AssistDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (action === 'ask') {
    const answer = text(r.text, MAX_BODY) ?? text(r.answer, MAX_BODY) ?? text(r.body, MAX_BODY);
    return answer ? { type: 'answer', text: answer } : null;
  }
  if (action === 'add' && (r.type === 'practice' || Array.isArray(r.items))) {
    const items = cleanChecklistDrafts(r.items);
    return items.length ? { type: 'practice', heading: text(r.heading, MAX_HEADING) ?? 'Practice problems', items } : null;
  }
  const section = cleanSection(r);
  return section ? { type: 'section', ...section } : null;
}

/** Merges new problems into a checklist, keeping progress and skipping repeats. */
export function mergeChecklist(existing: ChecklistItem[], added: ChecklistDraft[], options: { suggested: boolean; newId: () => string }): ChecklistItem[] {
  const seen = new Set(existing.map((i) => i.title.toLowerCase()));
  const fresh = added
    .filter((d) => !seen.has(d.title.toLowerCase()))
    .map((d): ChecklistItem => ({ ...d, id: options.newId(), suggested: options.suggested, outcome: null, attemptId: null }));
  return [...existing, ...fresh];
}

export const asChecklist = (items: unknown): ChecklistItem[] => (Array.isArray(items) ? (items as ChecklistItem[]) : []);

/** A way to find the problem even when the AI's link is missing or wrong. */
export function searchHref(item: Pick<ChecklistDraft, 'title' | 'platform'>): string {
  return `https://www.google.com/search?q=${encodeURIComponent([item.platform, item.title].filter(Boolean).join(' '))}`;
}

const STOP_AT = 60;
export function cardTitleFrom(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim();
  return clean.length > STOP_AT ? `${clean.slice(0, STOP_AT - 1).trimEnd()}…` : clean;
}
