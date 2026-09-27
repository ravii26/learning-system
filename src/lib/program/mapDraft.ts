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
export const MAX_DRAFT_COMPETENCIES = 25;

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';

export function buildMapDraftMessages(intake: Intake): AIMessage[] {
  const book = intake.bookTitle ? `\nThey are learning it from the book "${intake.bookTitle}": competencies should follow that book's main parts/ideas in order.` : '';
  return [
    { role: 'system', content: 'You are a curriculum designer. You list the competencies a field requires, like an expert syllabus. Return valid JSON only.' },
    {
      role: 'user',
      content: `A learner wants: ${intake.goal}${intake.doneMeans ? `\n"Done" for them means: ${intake.doneMeans}` : ''}${book}

List the competencies of this field as JSON:
{
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
}
Rules: 8 to ${MAX_DRAFT_COMPETENCIES} competencies in learning order; use "skill" for things improved by repeated practice (speaking, writing, drawing); include at least one "build" competency with "project" in its title when the field is learned by doing (e.g. "Run a first campaign project"); "from" is the lowest ambition at which it matters ("aware" = general understanding, "interview" = expert level).`,
    },
  ];
}

/** Parses the AI's map, repairs what's safely repairable, and validates the rest. */
export function parseMapDraft(raw: string, fallbackTitle: string): { map: CompetencyMap | null; problems: string[] } {
  let j: any;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { map: null, problems: ['The AI did not return a readable topic list.'] };
  }
  return sanitizeMap(j, fallbackTitle);
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
