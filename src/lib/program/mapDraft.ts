import {
  TARGET_LEVELS, validateMap,
  type Competency, type CompetencyKind, type CompetencyMap, type Importance, type TargetLevel,
} from '@/data/competencies';
import type { AIMessage } from '@/lib/ai/aiClient';
import type { Intake } from './types';

/**
 * Unknown fields: the AI drafts a competency map, which the learner reviews
 * and approves (edits allowed) before any plan is built on it. The draft goes
 * through the same validateMap() as the curated maps.
 */

const KINDS: CompetencyKind[] = ['concept', 'algorithm', 'design', 'build', 'skill'];
const IMPORTANCES: Importance[] = ['core', 'supporting', 'optional'];
export const MAX_DRAFT_COMPETENCIES = 30;
export const MIN_GOOD_DRAFT = 15;

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';

/** Excerpts from real syllabi/course outlines, used to ground the draft (optional). */
export interface GroundingSource { title: string; url: string; content: string }

const MAP_JSON_SHAPE = `{
  "title": "<field name>",
  "description": "<one sentence>",
  "competencies": [
    {
      "key": "<kebab-case id>",
      "title": "<short name>",
      "group": "<section, e.g. Foundations>",
      "kind": "concept|algorithm|design|build|skill",
      "importance": "core|supporting|optional",
      "from": "aware|use|build|interview",
      "prerequisites": ["<keys of earlier competencies>"],
      "summary": "<what being able to do this means, one sentence>"
    }
  ]
}`;

const MAP_RULES = `Rules:
- ${MIN_GOOD_DRAFT} to ${MAX_DRAFT_COMPETENCIES} competencies in learning order, grouped into 4-6 sections.
- Cover the whole field, not just the basics: spread "from" across all four levels ("aware" = general understanding, "use" = everyday work, "build" = real projects, "interview" = expert depth). At least 4 at "aware", 4 at "use", 3 at "build" and 3 at "interview" (advanced topics, hard trade-offs, what experts are asked).
- "kind": "concept" for knowledge, "skill" for practical abilities you improve by doing them repeatedly (writing ads, speaking, running social accounts), "build" ONLY for 1 or 2 end-to-end projects that prove the whole field (e.g. "Run a first campaign project"). Put "project" in those titles.
- Prerequisites only point to earlier competencies.`;

export function buildMapDraftMessages(intake: Intake, grounding: GroundingSource[] = []): AIMessage[] {
  const book = intake.bookTitle ? `
They are learning it from the book "${intake.bookTitle}": competencies should follow that book's main parts/ideas in order, then go beyond it where the field needs it.` : '';
  const sources = grounding.length
    ? `

Real course outlines and syllabi for this field (use them as evidence of what the field covers; do not copy their wording):
${grounding.map((g, i) => `[${i + 1}] ${g.title}
${g.content.slice(0, 900)}`).join('\n\n')}`
    : '';
  return [
    { role: 'system', content: 'You are an expert curriculum designer. You list the competencies a field requires, as a strong university or professional syllabus would. Return valid JSON only.' },
    {
      role: 'user',
      content: `A learner wants: ${intake.goal}${intake.doneMeans ? `
"Done" for them means: ${intake.doneMeans}` : ''}${book}${sources}

List the competencies of this field as JSON:
${MAP_JSON_SHAPE}
${MAP_RULES}`,
    },
  ];
}

/**
 * Second pass: an expert review of the draft. Returns the corrected full
 * list (same JSON), fixing missing essentials, wrong order, wrong levels and
 * duplicates. Keeps existing keys so the two passes line up.
 */
export function buildMapCritiqueMessages(intake: Intake, draft: CompetencyMap): AIMessage[] {
  const list = draft.competencies.map((c) => `- ${c.key} | ${c.title} | ${c.group} | ${c.kind} | ${c.importance} | from ${c.from}${c.prerequisites?.length ? ` | after ${c.prerequisites.join(', ')}` : ''}`).join('\n');
  return [
    { role: 'system', content: 'You are a senior practitioner reviewing a syllabus for gaps and mistakes. Return valid JSON only.' },
    {
      role: 'user',
      content: `Goal: ${intake.goal}${intake.doneMeans ? `. Done means: ${intake.doneMeans}` : ''}
Draft topic list for "${draft.title}" (key | title | section | kind | importance | level):
${list}

Review it as an expert would: what essential topics are missing, what is out of order, what is at the wrong level or importance, what is duplicated or too vague to learn? Then return the corrected complete list (keep the keys of topics you keep) as JSON:
${MAP_JSON_SHAPE}
${MAP_RULES}`,
    },
  ];
}

/** Uses the critique only when it's a real improvement: valid, not shrunk, not a different field. */
export function pickBetterMap(first: CompetencyMap, critiqued: CompetencyMap | null): { map: CompetencyMap; improved: boolean } {
  if (!critiqued) return { map: first, improved: false };
  const keep = new Set(first.competencies.map((c) => c.key));
  const overlap = critiqued.competencies.filter((c) => keep.has(c.key)).length;
  const sameField = overlap >= Math.min(5, Math.floor(first.competencies.length / 2));
  const notShrunk = critiqued.competencies.length >= Math.min(first.competencies.length, MIN_GOOD_DRAFT);
  return sameField && notShrunk ? { map: critiqued, improved: true } : { map: first, improved: false };
}

/** Parses the AI's map, repairs what's safely repairable, and validates the rest. */
export function parseMapDraft(raw: string, fallbackTitle: string): { map: CompetencyMap | null; problems: string[] } {
  let j: any;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { map: null, problems: ['The AI did not return a readable topic list.'] };
  }
  capProjects(j);
  return sanitizeMap(j, fallbackTitle);
}

export const MAX_DRAFT_PROJECTS = 2;

/**
 * AI drafts only: at most two end-to-end projects. Extra "build" topics are
 * practical abilities, so they become skills (practice) rather than more
 * projects. Prefers keeping the ones the AI titled as projects, latest first.
 * Lists the learner edits are not capped.
 */
export function capProjects(j: any): void {
  const comps: any[] = Array.isArray(j?.competencies) ? j.competencies : [];
  const builds = comps.filter((c) => c?.kind === 'build');
  if (builds.length <= MAX_DRAFT_PROJECTS) return;
  const ranked = [...builds].sort((a, b) =>
    Number(/project/i.test(String(b.title))) - Number(/project/i.test(String(a.title))) || comps.indexOf(b) - comps.indexOf(a));
  const keep = new Set(ranked.slice(0, MAX_DRAFT_PROJECTS));
  for (const c of builds) if (!keep.has(c)) c.kind = 'skill';
}

/**
 * Normalises any map-shaped object — the AI's draft, or the learner's edited
 * version posted back on approval — into a valid CompetencyMap or problems.
 */
export function sanitizeMap(j: any, fallbackTitle: string): { map: CompetencyMap | null; problems: string[] } {
  if (!j || !Array.isArray(j.competencies)) return { map: null, problems: ['No competencies were listed.'] };
  const seen = new Set<string>();
  const comps: Competency[] = [];
  const keyFor = new Map<string, string>();
  for (const c of j.competencies.slice(0, MAX_DRAFT_COMPETENCIES)) {
    const title = typeof c?.title === 'string' ? c.title.trim().slice(0, 80) : '';
    if (!title) continue;
    let key = slug(typeof c.key === 'string' && c.key ? c.key : title);
    while (seen.has(key)) key = `${key}-2`;
    seen.add(key);
    if (typeof c.key === 'string') keyFor.set(c.key, key);
    comps.push({
      key,
      title,
      group: typeof c.group === 'string' && c.group.trim() ? c.group.trim().slice(0, 40) : 'Core',
      kind: KINDS.includes(c.kind) ? c.kind : 'concept',
      importance: IMPORTANCES.includes(c.importance) ? c.importance : 'supporting',
      from: TARGET_LEVELS.includes(c.from) ? (c.from as TargetLevel) : 'use',
      prerequisites: Array.isArray(c.prerequisites) ? c.prerequisites.filter((p: unknown) => typeof p === 'string') : [],
      summary: typeof c.summary === 'string' && c.summary.trim() ? c.summary.trim().slice(0, 200) : title,
    });
  }
  // Remap prerequisite keys to the slugged ones; drop any that point nowhere or forward.
  const order = new Map(comps.map((c, i) => [c.key, i]));
  for (const c of comps) {
    c.prerequisites = (c.prerequisites ?? [])
      .map((p) => keyFor.get(p) ?? slug(p))
      .filter((p) => order.has(p) && order.get(p)! < order.get(c.key)!);
  }
  if (comps.length && !comps.some((c) => c.importance === 'core')) comps[0].importance = 'core';
  // A drafted "build" competency is something you make. Say so in its title,
  // so it becomes a Project (with an artifact as proof) and the learner sees it.
  for (const c of comps) {
    if (c.kind === 'build' && !/project/i.test(c.title)) c.title = `${c.title} (project)`.slice(0, 90);
  }

  const map: CompetencyMap = {
    key: 'custom',
    title: typeof j.title === 'string' && j.title.trim() ? j.title.trim().slice(0, 80) : fallbackTitle.slice(0, 80),
    aliases: [],
    description: typeof j.description === 'string' ? j.description.trim().slice(0, 240) : '',
    competencies: comps,
  };
  const problems = validateMap(map);
  return problems.length ? { map: null, problems } : { map, problems: [] };
}
