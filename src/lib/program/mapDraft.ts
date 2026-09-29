import {
  TARGET_LEVELS, validateMap,
  type Competency, type CompetencyKind, type CompetencyMap, type Importance, type TargetLevel,
} from '@/data/competencies';
import type { AIMessage } from '@/lib/ai/aiClient';
import type { Intake } from './types';
import { ARCHETYPE_GUIDE, LEVEL_WORDS, guessArchetype, isArchetype, type Archetype } from './fieldGuide';

/**
 * Unknown fields: the AI drafts a competency map, which the learner reviews
 * and approves (edits allowed) before any plan is built on it. The draft goes
 * through the same validateMap() as the curated maps.
 */

const KINDS: CompetencyKind[] = ['concept', 'algorithm', 'design', 'build', 'skill'];
const IMPORTANCES: Importance[] = ['core', 'supporting', 'optional'];
export const MAX_DRAFT_COMPETENCIES = 40;
export const MIN_GOOD_DRAFT = 15;
export const MAX_LESSONS = 8;

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';

/** Excerpts from real syllabi/course outlines, used to ground the draft (optional). */
export interface GroundingSource { title: string; url: string; content: string }

const MAP_JSON_SHAPE = `{
  "title": "<field name, e.g. Spoken English for job interviews>",
  "description": "<one sentence>",
  "competencies": [
    {
      "key": "<kebab-case id>",
      "title": "<specific name a teacher would write on the board>",
      "group": "<section, e.g. Stage 1: Survival basics>",
      "kind": "concept|algorithm|design|build|skill",
      "importance": "core|supporting|optional",
      "from": "aware|use|build|interview",
      "prerequisites": ["<keys of earlier competencies>"],
      "summary": "<what the learner can DO after it, concrete and checkable>",
      "lessons": ["<lesson 1 title>", "<lesson 2 title>"]
    }
  ]
}`;

function mapRules(archetype: Archetype, target: TargetLevel): string {
  const w = LEVEL_WORDS[archetype];
  return `Rules:
- 20 to ${MAX_DRAFT_COMPETENCIES} competencies in learning order, grouped into 4-7 sections.
- SPECIFIC, never vague. Every title names the actual thing a teacher would teach that week. Banned as titles: "Basics", "Fundamentals", "Introduction to X", "Advanced X", "X Techniques", "X Skills", "Deep dives", "Project 1", "Second project", "Understanding X", "Mastering X". Test: if a title could appear in the plan for a different field, rewrite it.
- "summary" says what the learner can do afterwards, measurably when possible ("introduce yourself for 90 seconds without long pauses", "switch between G and C 30 times a minute", "solve 10 two-pointer problems").
- "lessons": 1 to ${MAX_LESSONS} concrete lesson titles inside this competency, in order, each one 30-60 minute sitting (about 1 lesson per hour of work the topic needs). For "skill" topics, lessons are the specific drills/exercises to practise. For "build" topics, lessons are the steps of the project.
- "from" is the lowest level at which this topic belongs in a plan. For this kind of goal the levels mean: "aware" = ${w.aware}, "use" = ${w.use}, "build" = ${w.build}, "interview" = ${w.interview}.
- The learner is aiming for "${target}" (${w[target]}). EVERYTHING they need to reach their goal, including its final project/showcase, must have "from" at or below "${target}", or their plan will leave it out. Use levels above "${target}" only for 3-6 genuine next steps beyond their goal. A topic's level is never lower than the level of the topics it depends on.
- "kind": follow the guide for this kind of goal. "build" ONLY for 1 or 2 end-to-end projects/showcases; put "project" in those titles.
- Prerequisites only point to earlier competencies.
- Use the learner's answers: their situation decides the examples and which topics are core; their difficulties get extra, earlier topics; skip what they say they can already do (or mark it optional).`;
}

function learnerBlock(intake: Intake): string {
  const lines = [`Goal in their words: ${intake.goal}`];
  if (intake.doneMeans) lines.push(`"Done" for them means: ${intake.doneMeans}`);
  lines.push(`Current level (self-rated): ${intake.currentLevel}. Time: ${intake.hoursPerWeek} hours a week${intake.deadlineWeeks ? `, deadline ${intake.deadlineWeeks} weeks` : ''}.`);
  if (intake.why) lines.push(`Why: ${intake.why}`);
  for (const a of intake.answers ?? []) lines.push(`Q: ${a.question}\nA: ${a.answer}`);
  return lines.join('\n');
}

export function buildMapDraftMessages(intake: Intake, grounding: GroundingSource[] = [], archetypeIn?: Archetype): AIMessage[] {
  const archetype = archetypeIn ?? guessArchetype(intake.goal);
  const book = intake.bookTitle ? `
They are learning it from the book "${intake.bookTitle}": competencies should follow that book's main parts/ideas in order, then go beyond it where the field needs it.` : '';
  const sources = grounding.length
    ? `

Real course outlines and syllabi for this field (use them as evidence of what the field covers; do not copy their wording):
${grounding.map((g, i) => `[${i + 1}] ${g.title}
${g.content.slice(0, 900)}`).join('\n\n')}`
    : '';
  return [
    {
      role: 'system',
      content: 'You are a master teacher and curriculum designer with years of experience teaching exactly this kind of subject to real students. You write the syllabus you would actually teach from: concrete, in the right order, nothing vague. Return valid JSON only.',
    },
    {
      role: 'user',
      content: `THE LEARNER
${learnerBlock(intake)}${book}

HOW THIS KIND OF THING IS LEARNED
${ARCHETYPE_GUIDE[archetype]}${sources}

List the competencies for this learner's path as JSON:
${MAP_JSON_SHAPE}
${mapRules(archetype, intake.target)}`,
    },
  ];
}

/**
 * Second pass: an expert review of the draft. Returns the corrected full
 * list (same JSON), fixing missing essentials, wrong order, wrong levels,
 * vague titles and duplicates. Keeps existing keys so the two passes line up.
 */
export function buildMapCritiqueMessages(intake: Intake, draft: CompetencyMap, archetypeIn?: Archetype): AIMessage[] {
  const archetype = archetypeIn ?? (isArchetype(draft.archetype) ? draft.archetype : guessArchetype(intake.goal));
  const list = draft.competencies.map((c) => `- ${c.key} | ${c.title} | ${c.group} | ${c.kind} | ${c.importance} | from ${c.from}${c.prerequisites?.length ? ` | after ${c.prerequisites.join(', ')}` : ''}
    can do: ${c.summary}
    lessons: ${(c.lessons ?? []).join('; ')}`).join('\n');
  return [
    { role: 'system', content: "You are a demanding senior teacher reviewing a colleague's syllabus before it is given to a paying student. Return valid JSON only." },
    {
      role: 'user',
      content: `THE LEARNER
${learnerBlock(intake)}

HOW THIS KIND OF THING IS LEARNED
${ARCHETYPE_GUIDE[archetype]}

DRAFT for "${draft.title}" (key | title | section | kind | importance | level):
${list}

Review it hard:
1. What essential topics are missing for THIS learner's situation and difficulties? (Check against the guide's MUST list.)
2. Which titles or lessons are vague or generic? Rewrite them to name the actual thing taught.
3. What is out of order, at the wrong level, wrongly "core", or the wrong kind?
4. What is duplicated or not useful for this learner?
Then return the corrected COMPLETE list (keep the keys of topics you keep) as JSON:
${MAP_JSON_SHAPE}
${mapRules(archetype, intake.target)}`,
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

const lessonsOf = (v: unknown): string[] =>
  Array.from(new Set((Array.isArray(v) ? v : [])
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(Boolean))).slice(0, MAX_LESSONS);

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
      group: typeof c.group === 'string' && c.group.trim() ? c.group.trim().slice(0, 60) : 'Core',
      kind: KINDS.includes(c.kind) ? c.kind : 'concept',
      importance: IMPORTANCES.includes(c.importance) ? c.importance : 'supporting',
      from: TARGET_LEVELS.includes(c.from) ? (c.from as TargetLevel) : 'use',
      prerequisites: Array.isArray(c.prerequisites) ? c.prerequisites.filter((p: unknown) => typeof p === 'string') : [],
      summary: typeof c.summary === 'string' && c.summary.trim() ? c.summary.trim().slice(0, 240) : title,
      ...(lessonsOf(c.lessons).length ? { lessons: lessonsOf(c.lessons) } : {}),
    });
  }
  // Remap prerequisite keys to the slugged ones; drop any that point nowhere or forward.
  const order = new Map(comps.map((c, i) => [c.key, i]));
  for (const c of comps) {
    c.prerequisites = (c.prerequisites ?? [])
      .map((p) => keyFor.get(p) ?? slug(p))
      .filter((p) => order.has(p) && order.get(p)! < order.get(c.key)!);
  }
  // A topic can't be needed at a lower level than what it builds on: lift it.
  const levelOf = new Map(comps.map((c) => [c.key, c.from]));
  for (const c of comps) {
    const need = Math.max(TARGET_LEVELS.indexOf(c.from), ...(c.prerequisites ?? []).map((p) => TARGET_LEVELS.indexOf(levelOf.get(p) ?? 'aware')));
    c.from = TARGET_LEVELS[need];
    levelOf.set(c.key, c.from);
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
    ...(isArchetype(j.archetype) ? { archetype: j.archetype } : {}),
  };
  const problems = validateMap(map);
  return problems.length ? { map: null, problems } : { map, problems: [] };
}
