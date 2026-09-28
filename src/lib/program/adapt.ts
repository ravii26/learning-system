import type { AIMessage } from '@/lib/ai/aiClient';
import type { ProgramDraft } from './types';
import { targetLabel } from './why';

/**
 * The AI's whole job in program generation: adjust emphasis, name phases,
 * add one-line focus notes and explain the plan. Everything it returns is
 * clamped and filtered against the skeleton — it cannot add competencies,
 * items or links (custom fields may *name* resources, which become search
 * links marked unreviewed).
 */

export interface Adjustments {
  emphasis: Record<string, number>;
  phaseTitles: Record<number, string>;
  focus: Record<string, string>;
  whyThisPlan: string | null;
  namedResources: Array<{ itemId: string; title: string; type: 'BOOK' | 'COURSE' | 'VIDEO' | 'ARTICLE' }>;
  /** Real links found by the resource pipeline (never by the AI); re-verified on approval. */
  foundResources?: FoundResource[];
}

export interface FoundResource {
  itemId: string;
  title: string;
  url: string;
  type: 'BOOK' | 'COURSE' | 'VIDEO' | 'ARTICLE';
  via: 'openlibrary' | 'web' | 'youtube';
}

export const EMPTY_ADJUSTMENTS: Adjustments = { emphasis: {}, phaseTitles: {}, focus: {}, whyThisPlan: null, namedResources: [], foundResources: [] };
export const EMPHASIS_MIN = 0.5;
export const EMPHASIS_MAX = 1.5;

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Claims we can't check: percentages, and week/hour counts (the AI sees the
 * skeleton before its own emphasis changes the length, so any number it
 * states can contradict the header). Text containing them is dropped; the
 * factual why is used instead.
 */
const UNBACKED = /\d+\s*%|\bpercent\b|\b\d+[\s-]*(weeks?|hours?|months?)\b|\bh\/week\b/i;

export function buildAdaptMessages(skeleton: ProgramDraft, factualWhy: string): AIMessage[] {
  const i = skeleton.intake;
  const comps = skeleton.coverage.map((c) => {
    const comp = skeleton.map.competencies.find((x) => x.key === c.key)!;
    return `- ${c.key} | ${comp.title} | ${comp.kind} | ${c.importance}`;
  }).join('\n');
  const phases = skeleton.phases.map((p) =>
    `Phase ${p.phase} "${p.title}" (${p.weeks} wk): ` + p.items.map((it) => `[${it.id}] ${it.shape}: ${it.competencyKeys.join(', ')}`).join('; '),
  ).join('\n');
  const custom = skeleton.mapQuality !== 'curated';

  const user = `Learner goal (their words): ${clip(i.goal, 300)}
Target: ${targetLabel(i.target, i.archetype ?? skeleton.map.archetype)}${i.doneMeans ? `. "Done" for them means: ${clip(i.doneMeans, 300)}` : ''}
Current level: ${i.currentLevel}. Hours per week: ${i.hoursPerWeek}.${i.why ? ` Why: ${clip(i.why, 300)}.` : ''}
${i.placement ? `Placement: strong in ${i.placement.strong.join(', ') || 'nothing yet'}; weak in ${i.placement.weak.join(', ') || 'nothing'}.` : 'No placement check.'}
${(i.answers ?? []).map((x) => `${clip(x.question, 160)} → ${clip(x.answer, 300)}`).join('\n')}

Competencies in scope (key | title | kind | importance):
${comps}

Plan skeleton (fixed; you may not add or remove anything):
${phases}

Facts about this plan: ${factualWhy}

Return JSON only:
{
  "emphasis": { "<competency key>": <number ${EMPHASIS_MIN}-${EMPHASIS_MAX}, 1 = default> },
  "phaseTitles": { "<phase number>": "<short, concrete title>" },
  "focus": { "<item id>": "<one sentence: what to pay attention to in this item for THIS learner>" },
  "whyThisPlan": "<3-5 sentences, second person, explaining the plan's shape from the facts above. No hype. Never claim mastery.>"${custom ? `,
  "namedResources": [ { "itemId": "<item id>", "title": "<exact title of a real, well-known book or course>", "type": "BOOK|COURSE|VIDEO|ARTICLE" } ]` : ''}
}
Only raise emphasis where the learner's goal, "done" definition or placement gives a reason; only use keys and ids listed above.
Do not state numbers of weeks or hours (the screen shows them), and do not quote statistics or percentages.${custom ? ' This field has no reviewed resource list, so namedResources is required: 1 or 2 per item, only well-known books, courses or official guides you are certain exist, exact titles, no URLs.' : ''}`;

  return [
    { role: 'system', content: 'You adapt a fixed, expert-reviewed learning plan to one learner. You never add topics or invent links. Return valid JSON only.' },
    { role: 'user', content: user },
  ];
}

/**
 * Emphasis is relative: the AI may move time between competencies, not add
 * it. Rescales so the mean over all competencies in scope is 1 (unlisted
 * ones count as 1), then re-clamps. "Everything 1.5" becomes "everything 1".
 */
export function normalizeEmphasis(emphasis: Record<string, number>, allKeys: string[]): Record<string, number> {
  if (!allKeys.length || !Object.keys(emphasis).length) return emphasis;
  const mean = allKeys.reduce((s, k) => s + (emphasis[k] ?? 1), 0) / allKeys.length;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(emphasis)) {
    const n = Math.round(Math.min(EMPHASIS_MAX, Math.max(EMPHASIS_MIN, v / mean)) * 100) / 100;
    if (n !== 1) out[k] = n;
  }
  return out;
}

/** Parses and clamps the AI's reply against the skeleton. Anything unknown is dropped. */
export function parseAdjustments(raw: string, skeleton: ProgramDraft): Adjustments {
  let j: any;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return EMPTY_ADJUSTMENTS;
  }
  if (!j || typeof j !== 'object') return EMPTY_ADJUSTMENTS;

  const compKeys = new Set(skeleton.coverage.map((c) => c.key));
  const itemIds = new Set(skeleton.phases.flatMap((p) => p.items.map((it) => it.id)));
  const phaseNums = new Set(skeleton.phases.map((p) => p.phase));
  const out: Adjustments = { emphasis: {}, phaseTitles: {}, focus: {}, whyThisPlan: null, namedResources: [] };

  for (const [k, v] of Object.entries(j.emphasis ?? {})) {
    const n = Number(v);
    if (compKeys.has(k) && Number.isFinite(n)) out.emphasis[k] = Math.min(EMPHASIS_MAX, Math.max(EMPHASIS_MIN, n));
  }
  out.emphasis = normalizeEmphasis(out.emphasis, Array.from(compKeys));
  for (const [k, v] of Object.entries(j.phaseTitles ?? {})) {
    const n = Number(k);
    if (phaseNums.has(n) && typeof v === 'string' && v.trim()) out.phaseTitles[n] = clip(v, 60);
  }
  for (const [k, v] of Object.entries(j.focus ?? {})) {
    if (itemIds.has(k) && typeof v === 'string' && v.trim() && !UNBACKED.test(v)) out.focus[k] = clip(v, 200);
  }
  if (typeof j.whyThisPlan === 'string' && j.whyThisPlan.trim().length >= 40
    && !/\bmaster(ed|y)?\b/i.test(j.whyThisPlan) && !UNBACKED.test(j.whyThisPlan)) {
    out.whyThisPlan = clip(j.whyThisPlan, 900);
  }
  if (skeleton.mapQuality !== 'curated' && Array.isArray(j.namedResources)) {
    const perItem = new Map<string, number>();
    for (const r of j.namedResources) {
      const itemId = typeof r?.itemId === 'string' ? r.itemId : '';
      const title = typeof r?.title === 'string' ? clip(r.title, 140) : '';
      if (!itemIds.has(itemId) || !title || /https?:\/\//i.test(title)) continue;
      if ((perItem.get(itemId) ?? 0) >= 2) continue;
      perItem.set(itemId, (perItem.get(itemId) ?? 0) + 1);
      const type = ['BOOK', 'COURSE', 'VIDEO', 'ARTICLE'].includes(r.type) ? r.type : 'ARTICLE';
      out.namedResources.push({ itemId, title, type });
    }
  }
  return out;
}
