import type { Competency, CompetencyKind, CompetencyMap, EvidenceRequirement, Importance, TargetLevel } from './types';
import { TARGET_LEVELS } from './types';
import { systemDesign } from './systemDesign';
import { dsa } from './dsa';
import { dbms } from './dbms';
import { os } from './os';
import { networking } from './networking';
import { frontend } from './frontend';
import { backend } from './backend';

export * from './types';

/** Hand-reviewed maps. New fields are added here; no other code changes. */
export const CURATED_MAPS: CompetencyMap[] = [systemDesign, dsa, dbms, os, networking, frontend, backend];

export function getMap(key: string): CompetencyMap | null {
  return CURATED_MAPS.find((m) => m.key === key) ?? null;
}

/**
 * Best curated map for free text like "I want to crack HLD interviews", or
 * null when nothing fits (the unknown-topic path takes over). Longest alias
 * match wins, so "system design" beats "design".
 */
export function matchMap(text: string): CompetencyMap | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9+.#/ -]/g, ' ').replace(/\s+/g, ' ')} `;
  let best: { map: CompetencyMap; len: number } | null = null;
  for (const map of CURATED_MAPS) {
    for (const alias of map.aliases) {
      if (t.includes(` ${alias} `) && (!best || alias.length > best.len)) best = { map, len: alias.length };
    }
  }
  return best?.map ?? null;
}

const rank = (l: TargetLevel) => TARGET_LEVELS.indexOf(l);

/** Topic.depthTarget words → target level. */
export function targetFromDepth(depth: string | null | undefined): TargetLevel {
  switch ((depth ?? '').toLowerCase()) {
    case 'awareness': return 'aware';
    case 'working knowledge': return 'use';
    case 'proficiency': return 'build';
    case 'deep':
    case 'mastery': return 'interview';
    default: return 'use';
  }
}

export const DEPTH_FOR_TARGET: Record<TargetLevel, string> = {
  aware: 'Awareness',
  use: 'Working Knowledge',
  build: 'Proficiency',
  interview: 'Deep',
};

/** The competencies a program at this target level must cover. */
export function competenciesForTarget(map: CompetencyMap, target: TargetLevel): Competency[] {
  return map.competencies.filter((c) => rank(c.from) <= rank(target));
}

export const IMPORTANCE_WEIGHT: Record<Importance, number> = { core: 3, supporting: 2, optional: 1 };

/**
 * What counts as proof of a competency at a target level. Cumulative: each
 * level keeps the previous level's requirements and raises the bar. The
 * kind decides the form of proof: problems for algorithms, a project for
 * build skills, explanation for concepts, repeated reps for skills.
 */
export function requiredEvidence(kind: CompetencyKind, target: TargetLevel): EvidenceRequirement[] {
  const r = rank(target);
  // Every requirement must be something the item's shape can actually
  // produce. Skills become Practice topics (reps, no quizzes); "know about
  // it" goals become Explore topics (ideas turned into review cards).
  if (kind === 'skill') return [{ kind: 'practice', minReps: [1, 3, 5, 8][r] }];
  if (r === 0) return [{ kind: 'recall', minCards: 2 }];
  const out: EvidenceRequirement[] = [{ kind: 'quiz', minScore: 0.8 }];
  out.push({ kind: 'recall', minCards: 3 });
  if (kind === 'algorithm') out.push({ kind: 'problems_cold', count: [0, 2, 4, 6][r] });
  if (kind === 'design' && r >= 2) out.push({ kind: 'problems_cold', count: r === 2 ? 1 : 2 });
  if (kind === 'build' && r >= 2) out.push({ kind: 'project' });
  if (r >= 3 || (r >= 2 && (kind === 'concept' || kind === 'design'))) out.push({ kind: 'explain' });
  return out;
}

const KINDS: CompetencyKind[] = ['concept', 'algorithm', 'design', 'build', 'skill'];
const IMPORTANCES: Importance[] = ['core', 'supporting', 'optional'];

/**
 * Structural check for any map — curated ones in tests, AI-drafted ones at
 * runtime before a user ever sees them. Returns problems, [] when valid.
 */
export function validateMap(map: CompetencyMap): string[] {
  const problems: string[] = [];
  if (!map.key || !map.title) problems.push('map needs a key and title');
  if (!Array.isArray(map.competencies) || map.competencies.length < 3) problems.push('map needs at least 3 competencies');
  const keys = new Set<string>();
  for (const c of map.competencies ?? []) {
    if (!c.key || !c.title || !c.group || !c.summary) problems.push(`competency ${c.key || '?'} is missing fields`);
    if (keys.has(c.key)) problems.push(`duplicate competency key ${c.key}`);
    keys.add(c.key);
    if (!KINDS.includes(c.kind)) problems.push(`${c.key}: bad kind ${c.kind}`);
    if (!IMPORTANCES.includes(c.importance)) problems.push(`${c.key}: bad importance ${c.importance}`);
    if (!TARGET_LEVELS.includes(c.from)) problems.push(`${c.key}: bad level ${c.from}`);
  }
  for (const c of map.competencies ?? []) {
    for (const p of c.prerequisites ?? []) {
      if (!keys.has(p)) problems.push(`${c.key}: unknown prerequisite ${p}`);
      if (p === c.key) problems.push(`${c.key}: depends on itself`);
    }
  }
  if (hasCycle(map)) problems.push('prerequisites form a cycle');
  if (!(map.competencies ?? []).some((c) => c.importance === 'core')) problems.push('map has no core competency');
  return problems;
}

function hasCycle(map: CompetencyMap): boolean {
  const deps = new Map((map.competencies ?? []).map((c) => [c.key, c.prerequisites ?? []]));
  const state = new Map<string, 1 | 2>(); // 1 visiting, 2 done
  const visit = (k: string): boolean => {
    if (state.get(k) === 2) return false;
    if (state.get(k) === 1) return true;
    state.set(k, 1);
    for (const d of deps.get(k) ?? []) if (deps.has(d) && visit(d)) return true;
    state.set(k, 2);
    return false;
  };
  return Array.from(deps.keys()).some(visit);
}

/** Prerequisite-respecting order (stable: keeps map order where free). */
export function orderByPrerequisites(comps: Competency[]): Competency[] {
  const inSet = new Set(comps.map((c) => c.key));
  const done = new Set<string>();
  const out: Competency[] = [];
  const remaining = [...comps];
  while (remaining.length) {
    const i = remaining.findIndex((c) => (c.prerequisites ?? []).every((p) => !inSet.has(p) || done.has(p)));
    const next = remaining.splice(i === -1 ? 0 : i, 1)[0]; // -1 only on a cycle; validateMap rejects those
    done.add(next.key);
    out.push(next);
  }
  return out;
}
