import type { AIMessage } from '@/lib/ai/aiClient';
import type { RubricTemplate } from '@/lib/practiceRubrics';

/**
 * Feedback on one practice rep (a spoken or written answer). Two parts:
 * numbers the app measures itself (free, exact: words, pace, filler words)
 * and a coach's judgement from the AI (scores on the topic's rubric, what
 * worked, each mistake with a better way to say it, an improved version).
 * The AI never sees audio, only the transcript, so it can't judge accent
 * or pronunciation, and it is told so.
 */

export interface SpeechStats {
  words: number;
  seconds: number | null;
  wordsPerMinute: number | null;
  fillers: { word: string; count: number }[];
  fillerCount: number;
}

// Common English fillers. "like"/"so" are only counted in filler positions (after a pause-ish comma or at a sentence start).
const FILLERS: { word: string; re: RegExp }[] = [
  { word: 'um', re: /\b(um+|umm+|hmm+)\b/gi },
  { word: 'uh', re: /\b(uh+|er+|ah+)\b/gi },
  { word: 'you know', re: /\byou know\b/gi },
  { word: 'basically', re: /\bbasically\b/gi },
  { word: 'actually', re: /\bactually\b/gi },
  { word: 'I mean', re: /\bi mean\b/gi },
  { word: 'kind of', re: /\bkind of\b/gi },
  { word: 'sort of', re: /\bsort of\b/gi },
  { word: 'like', re: /(^|[.,!?]\s*|\b(?:was|is|it's|and)\s+)like\b(?=,|\s+(?:um|uh|you know|i|we|the|a)\b)/gi },
];

export function speechStats(text: string, seconds?: number | null): SpeechStats {
  const clean = (text ?? '').trim();
  const words = clean ? clean.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length : 0;
  const fillers = FILLERS.map((f) => ({ word: f.word, count: (clean.match(f.re) ?? []).length })).filter((f) => f.count > 0);
  const secs = seconds && seconds > 0 ? Math.round(seconds) : null;
  return {
    words,
    seconds: secs,
    wordsPerMinute: secs && secs >= 10 ? Math.round((words / secs) * 60) : null,
    fillers,
    fillerCount: fillers.reduce((s, f) => s + f.count, 0),
  };
}

export interface RepFeedback {
  /** Raw 1..5 per rubric dimension, same meaning as the rep form (inverted ones: lower is better). */
  scores: Record<string, number>;
  summary: string;
  strengths: string[];
  fixes: { said: string; better: string; why: string }[];
  betterVersion: string;
  nextFocus: string;
}

export interface FeedbackInput {
  skill: string;
  promptText: string;
  answer: string;
  spoken: boolean;
  stats: SpeechStats;
  template: RubricTemplate;
  /** The learner's goal and situation, when the topic is part of a plan. */
  context?: string;
}

export function buildFeedbackMessages(i: FeedbackInput): AIMessage[] {
  const dims = i.template.dimensions
    .map((d) => `- "${d.key}" (${d.label}${d.hint ? `: ${d.hint}` : ''})${d.inverted ? ' — INVERTED: 1 = hardly any / best, 5 = a lot / worst' : ' — 1 = weak, 5 = excellent'}`)
    .join('\n');
  const stats = [
    `${i.stats.words} words`,
    i.stats.seconds ? `${i.stats.seconds} seconds` : null,
    i.stats.wordsPerMinute ? `${i.stats.wordsPerMinute} words per minute (comfortable interview pace is roughly 120-160)` : null,
    i.stats.fillerCount ? `filler words counted: ${i.stats.fillers.map((f) => `${f.word} ×${f.count}`).join(', ')}` : 'no filler words detected in the transcript',
  ].filter(Boolean).join('; ');
  return [
    {
      role: 'system',
      content: 'You are an encouraging but exact speaking and communication coach. You judge only what is in the text. You never invent mistakes, and every correction you give is correct English. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `Skill being practised: ${i.skill}
${i.context ? `About the learner: ${i.context}\n` : ''}Task given: ${i.promptText}

Learner's answer (${i.spoken ? 'spoken, from browser speech-to-text: ignore punctuation and capitals, don\'t blame the learner for obvious transcription slips, and note that speech-to-text often drops "um"/"uh", so fillers may be undercounted' : 'written'}):
"""
${i.answer.slice(0, 6000)}
"""
Measured by the app: ${stats}.

Score each dimension from 1 to 5:
${dims}

Then coach them:
- "summary": 1-2 sentences, honest overall impression.
- "strengths": 1-3 specific things they did well (quote them).
- "fixes": up to 6 real problems, most important first: grammar errors, unnatural phrasing, Indian-English habits that sound odd in interviews (e.g. "myself Ravi", "discuss about", "I am having"), vague or rambling parts, missing structure. Each with what they said, a better way to say it, and a one-line why.
- "betterVersion": their answer rewritten the way a strong speaker would say it, keeping their content and roughly the same length. Natural spoken English, not a formal essay.
- "nextFocus": one concrete thing to practise in the next rep.
You only have text: never comment on accent, pronunciation or tone of voice.

Return JSON:
{"scores": {${i.template.dimensions.map((d) => `"${d.key}": <1-5>`).join(', ')}}, "summary": "...", "strengths": ["..."], "fixes": [{"said": "...", "better": "...", "why": "..."}], "betterVersion": "...", "nextFocus": "..."}`,
    },
  ];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Keeps only scores for the template's dimensions (clamped 1..5); null if there's nothing usable. */
export function parseFeedback(raw: unknown, template: RubricTemplate): RepFeedback | null {
  let j: any = raw;
  if (typeof raw === 'string') {
    try {
      j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      return null;
    }
  }
  if (!j || typeof j !== 'object') return null;
  const scores: Record<string, number> = {};
  for (const d of template.dimensions) {
    const n = Math.round(Number(j.scores?.[d.key]));
    if (Number.isFinite(n)) scores[d.key] = Math.min(5, Math.max(1, n));
  }
  const fixes = (Array.isArray(j.fixes) ? j.fixes : [])
    .map((f: any) => ({ said: str(f?.said, 400), better: str(f?.better, 400), why: str(f?.why, 300) }))
    .filter((f: { better: string }) => f.better)
    .slice(0, 6);
  const out: RepFeedback = {
    scores,
    summary: str(j.summary, 500),
    strengths: (Array.isArray(j.strengths) ? j.strengths : []).map((s: unknown) => str(s, 300)).filter(Boolean).slice(0, 3),
    fixes,
    betterVersion: str(j.betterVersion, 4000),
    nextFocus: str(j.nextFocus, 300),
  };
  const usable = Object.keys(scores).length === template.dimensions.length && (out.summary || out.fixes.length || out.betterVersion);
  return usable ? out : null;
}
