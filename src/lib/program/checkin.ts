import type { Competency, CompetencyMap } from '@/data/competencies';
import type { AIMessage } from '@/lib/ai/aiClient';
import { estimateHours } from './skeleton';
import { EMPHASIS_MAX, EMPHASIS_MIN } from './adapt';
import type { Intake } from './types';

/**
 * Weekly check-in: a deterministic week summary, signals derived from it,
 * an AI proposal of at most three typed changes that must cite those
 * signals, and applying the accepted ones to produce the next program
 * version. Re-planning never restructures a program — same items, same
 * topics, same progress — it changes hours, emphasis and focus notes.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- summary

export interface WeekSummary {
  windowStart: string;
  windowEnd: string;
  plannedMinutes: number;
  actualMinutes: number;
  modulesCompleted: string[];                       // competency titles
  quizzes: Array<{ key: string; title: string; score: number }>;
  problems: { cold: number; hint: number; stuck: number; stuckKeys: string[] };
  lapses: Array<{ key: string; title: string; count: number }>;
  practiceReps: number;
  currentPhase: number | null;                      // first checkpoint not yet ready
  expectedPhase: number;                            // where the schedule says you'd be
}

export interface Signal { id: string; text: string }

export function expectedPhase(phaseWeeks: number[], weeksElapsed: number): number {
  let acc = 0;
  for (let i = 0; i < phaseWeeks.length; i++) {
    acc += phaseWeeks[i];
    if (weeksElapsed < acc) return i + 1;
  }
  return phaseWeeks.length;
}

/** What in this week is worth reacting to. Empty means "on track": no AI call, no proposal. */
export function detectSignals(s: WeekSummary): Signal[] {
  const out: Signal[] = [];
  const pct = s.plannedMinutes ? Math.round((s.actualMinutes / s.plannedMinutes) * 100) : 100;
  const h = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
  if (pct < 60) out.push({ id: 'time', text: `Studied ${h(s.actualMinutes)} of ${h(s.plannedMinutes)} planned (${pct}%).` });
  else if (pct > 140) out.push({ id: 'time', text: `Studied ${h(s.actualMinutes)}, well over the ${h(s.plannedMinutes)} planned (${pct}%).` });
  if (s.currentPhase !== null && s.currentPhase < s.expectedPhase) {
    out.push({ id: 'schedule', text: `Still on phase ${s.currentPhase}; the schedule expected phase ${s.expectedPhase} by now.` });
  }
  const weak = new Map<string, string[]>();
  const add = (key: string, why: string) => weak.set(key, [...(weak.get(key) ?? []), why]);
  for (const q of s.quizzes) if (q.score < 0.8) add(q.key, `quiz ${Math.round(q.score * 100)}%`);
  for (const l of s.lapses) if (l.count >= 2) add(l.key, `forgot ${l.count} review cards`);
  for (const k of s.problems.stuckKeys) add(k, 'got stuck on a problem');
  const title = (key: string) => s.quizzes.find((q) => q.key === key)?.title ?? s.lapses.find((l) => l.key === key)?.title ?? key;
  for (const [key, whys] of Array.from(weak.entries())) out.push({ id: `weak:${key}`, text: `${title(key)}: ${whys.join(', ')}.` });
  return out;
}

// --------------------------------------------------------------- proposal

export type Change =
  | { type: 'set_hours'; hoursPerWeek: number; reason: string; evidence: string[] }
  | { type: 'emphasize'; competencyKey: string; factor: number; reason: string; evidence: string[] }
  | { type: 'focus'; competencyKey: string; text: string; reason: string; evidence: string[] };

export const MAX_CHANGES = 3;
const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const clampHours = (n: number) => Math.max(1, Math.min(60, Math.round(n)));
const clampFactor = (n: number) => Math.round(Math.max(EMPHASIS_MIN, Math.min(EMPHASIS_MAX, n)) * 100) / 100;

export function buildCheckinMessages(s: WeekSummary, signals: Signal[], ctx: { goal: string; hoursPerWeek: number; competencies: Competency[] }): AIMessage[] {
  return [
    { role: 'system', content: 'You review one week of a learner’s study plan and propose small, evidence-backed adjustments. Return valid JSON only.' },
    {
      role: 'user',
      content: `Goal: ${clip(ctx.goal, 200)}. Planned: ${ctx.hoursPerWeek} h/week.
What happened this week (facts):
${signals.map((x) => `- [${x.id}] ${x.text}`).join('\n')}
Also: ${s.modulesCompleted.length} modules finished; problems solved cold ${s.problems.cold}, with hints ${s.problems.hint}, stuck ${s.problems.stuck}; ${s.practiceReps} practice reps.

Competency keys you may reference: ${ctx.competencies.map((c) => `${c.key} (${c.title})`).join(', ')}

Propose at most ${MAX_CHANGES} changes as JSON:
{ "changes": [
  { "type": "set_hours", "hoursPerWeek": <1-60>, "reason": "<one sentence>", "evidence": ["<fact id>"] },
  { "type": "emphasize", "competencyKey": "<key>", "factor": <${EMPHASIS_MIN}-${EMPHASIS_MAX}>, "reason": "...", "evidence": ["..."] },
  { "type": "focus", "competencyKey": "<key>", "text": "<one concrete instruction for next week>", "reason": "...", "evidence": ["..."] }
] }
Every change must cite at least one fact by its id, the word in square brackets (e.g. "time"), not its text. Prefer the smallest change that addresses the facts. Be kind and specific; no hype.`,
    },
  ];
}

/** Validates the AI's proposal: known types and keys, clamped numbers, cited evidence only. */
export function parseProposal(raw: string, signals: Signal[], competencyKeys: string[]): Change[] {
  let j: any;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  const keys = new Set(competencyKeys);
  // Models often cite the fact's text (or "[time]") instead of its id. Accept
  // those only when they match one of the facts we gave; anything else is dropped.
  const citeToId = (e: unknown): string | null => {
    if (typeof e !== 'string' || !e.trim()) return null;
    const t = e.trim().replace(/^\[|\]$/g, '');
    const byId = signals.find((s) => s.id === t);
    if (byId) return byId.id;
    const lower = t.toLowerCase();
    const byText = signals.find((s) => s.text.toLowerCase().includes(lower) || (lower.length >= 12 && lower.includes(s.text.toLowerCase())));
    return lower.length >= 6 && byText ? byText.id : null;
  };
  const out: Change[] = [];
  for (const c of Array.isArray(j?.changes) ? j.changes : []) {
    if (out.length >= MAX_CHANGES) break;
    const cited: string[] = Array.isArray(c?.evidence)
      ? (c.evidence as unknown[]).map(citeToId).filter((x): x is string => !!x)
      : [];
    const evidence = Array.from(new Set(cited));
    const reason = typeof c?.reason === 'string' ? clip(c.reason, 240) : '';
    if (!evidence.length || !reason) continue;
    if (c.type === 'set_hours' && Number.isFinite(Number(c.hoursPerWeek))) {
      out.push({ type: 'set_hours', hoursPerWeek: clampHours(Number(c.hoursPerWeek)), reason, evidence });
    } else if (c.type === 'emphasize' && keys.has(c.competencyKey) && Number.isFinite(Number(c.factor))) {
      out.push({ type: 'emphasize', competencyKey: c.competencyKey, factor: clampFactor(Number(c.factor)), reason, evidence });
    } else if (c.type === 'focus' && keys.has(c.competencyKey) && typeof c.text === 'string' && c.text.trim()) {
      out.push({ type: 'focus', competencyKey: c.competencyKey, text: clip(c.text, 200), reason, evidence });
    }
  }
  return out;
}

/** Used when the AI is unavailable or returns nothing usable: the obvious, conservative changes. */
export function fallbackProposal(s: WeekSummary, signals: Signal[]): Change[] {
  const out: Change[] = [];
  const time = signals.find((x) => x.id === 'time');
  if (time && s.actualMinutes < s.plannedMinutes) {
    const realistic = clampHours(Math.max(s.actualMinutes / 60, (s.plannedMinutes / 60) * 0.6));
    out.push({ type: 'set_hours', hoursPerWeek: realistic, reason: 'Plan around the time you actually had, so the schedule stays honest.', evidence: ['time'] });
  }
  for (const sig of signals.filter((x) => x.id.startsWith('weak:')).slice(0, MAX_CHANGES - out.length)) {
    const key = sig.id.slice(5);
    out.push({ type: 'emphasize', competencyKey: key, factor: 1.3, reason: 'Give this topic more time before moving on.', evidence: [sig.id] });
  }
  return out.slice(0, MAX_CHANGES);
}

// ------------------------------------------------------------------ apply

export interface VersionState {
  intake: Intake;
  map: CompetencyMap;
  emphasis: Record<string, number>;
  focus: Record<string, string>;                    // by competency key (carried to its item)
  items: Array<{ id: string; phase: number; shape: string; competencyKeys: string[]; hoursPerWeek: number; weeks: number; focus: string | null }>;
}

export type Decision = { index: number; action: 'accept' | 'decline' | 'modify'; value?: number | string };

/** Applies the user's decisions to the proposal. Returns the accepted changes as finally applied. */
export function resolveDecisions(proposal: Change[], decisions: Decision[]): Change[] {
  const accepted: Change[] = [];
  proposal.forEach((c, i) => {
    const d = decisions.find((x) => x.index === i);
    if (!d || d.action === 'decline') return;
    if (d.action === 'accept') return void accepted.push(c);
    if (c.type === 'set_hours' && Number.isFinite(Number(d.value))) accepted.push({ ...c, hoursPerWeek: clampHours(Number(d.value)) });
    else if (c.type === 'emphasize' && Number.isFinite(Number(d.value))) accepted.push({ ...c, factor: clampFactor(Number(d.value)) });
    else if (c.type === 'focus' && typeof d.value === 'string' && d.value.trim()) accepted.push({ ...c, text: clip(d.value, 200) });
  });
  return accepted;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Next version from the current one plus accepted changes. Same items and
 * phases; hours per item and phase lengths are recomputed from the new
 * weekly hours and emphasis.
 */
export function applyChanges(state: VersionState, changes: Change[]): VersionState & { totalWeeks: number } {
  const intake: Intake = { ...state.intake };
  const emphasis = { ...state.emphasis };
  const focus = { ...state.focus };
  for (const c of changes) {
    if (c.type === 'set_hours') intake.hoursPerWeek = c.hoursPerWeek;
    if (c.type === 'emphasize') emphasis[c.competencyKey] = clampFactor((emphasis[c.competencyKey] ?? 1) * c.factor);
    if (c.type === 'focus') focus[c.competencyKey] = c.text;
  }
  const comp = new Map(state.map.competencies.map((c) => [c.key, c]));
  const hoursOf = (keys: string[]) => keys.reduce((s, k) => s + (comp.has(k) ? estimateHours(comp.get(k)!, intake, emphasis[k] ?? 1) : 0), 0);

  const phases = Array.from(new Set(state.items.map((i) => i.phase))).sort((a, b) => a - b);
  const weeksOf = new Map(phases.map((p) => {
    const total = state.items.filter((i) => i.phase === p).reduce((s, i) => s + hoursOf(i.competencyKeys), 0);
    return [p, Math.max(1, Math.ceil(total / intake.hoursPerWeek))];
  }));
  const items = state.items.map((it) => {
    const weeks = weeksOf.get(it.phase)!;
    const note = it.competencyKeys.map((k) => focus[k]).find(Boolean) ?? it.focus;
    return { ...it, weeks, hoursPerWeek: round1(hoursOf(it.competencyKeys) / weeks), focus: note ?? null };
  });
  return { intake, map: state.map, emphasis, focus, items, totalWeeks: Array.from(weeksOf.values()).reduce((a, b) => a + b, 0) };
}

export function describeChange(c: Change, title: (k: string) => string): string {
  switch (c.type) {
    case 'set_hours': return `Plan for ${c.hoursPerWeek} h/week`;
    case 'emphasize': return c.factor >= 1 ? `More time on ${title(c.competencyKey)} (×${c.factor})` : `Less time on ${title(c.competencyKey)} (×${c.factor})`;
    case 'focus': return `Focus for ${title(c.competencyKey)}: ${c.text}`;
  }
}
