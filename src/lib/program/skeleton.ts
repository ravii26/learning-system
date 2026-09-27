import {
  competenciesForTarget, orderByPrerequisites,
  type Competency, type CompetencyMap, type TargetLevel,
} from '@/data/competencies';
import { findCatalogResources, type CatalogResource, type ResourceRole } from '@/data/resources';
import type { CoverageRow, DraftItem, DraftPhase, DraftResource, Intake, ProgramDraft, Shape } from './types';

/**
 * The deterministic core of program generation. Given a competency map and
 * the intake, it decides what's in the plan, in what order, how long it
 * takes and which catalogue resources to use. The AI later adjusts emphasis
 * and wording inside this skeleton (adapt.ts); it never changes what's in it.
 */

export const MAX_PHASES = 5;

const BASE_HOURS: Record<Competency['kind'], number> = { concept: 3, algorithm: 6, design: 5, build: 8, skill: 5 };
const TARGET_MULT: Record<TargetLevel, number> = { aware: 0.5, use: 1, build: 1.5, interview: 2 };
const IMPORTANCE_MULT: Record<Competency['importance'], number> = { core: 1, supporting: 0.7, optional: 0.5 };
const LEVEL_MULT: Record<Intake['currentLevel'], number> = { beginner: 1.2, intermediate: 1, advanced: 0.75 };

const roundHalf = (n: number) => Math.max(1, Math.round(n * 2) / 2);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Estimated study hours for one competency, before AI emphasis. */
export function estimateHours(c: Competency, intake: Intake, emphasis = 1): number {
  let h = BASE_HOURS[c.kind] * TARGET_MULT[intake.target] * IMPORTANCE_MULT[c.importance] * LEVEL_MULT[intake.currentLevel];
  if (intake.placement?.strong.includes(c.key)) h *= 0.5;
  if (intake.placement?.weak.includes(c.key)) h *= 1.3;
  return roundHalf(h * emphasis);
}

export function shapeFor(c: Competency, intake: Intake): Shape {
  if (c.kind === 'build' && /project/i.test(`${c.key} ${c.title}`)) return 'project';
  if (c.kind === 'skill') return 'practice';
  if (intake.bookTitle) return 'reading';
  if (intake.target === 'aware') return 'exploration';
  return 'course';
}

/**
 * Chooses what's in scope. With a deadline that doesn't fit, drops optional
 * competencies first, then supporting ones nothing kept depends on. Never
 * drops core ones: if it still doesn't fit, it says so instead.
 */
export function scopeCompetencies(
  map: CompetencyMap, intake: Intake, emphasis: Record<string, number> = {},
): { comps: Competency[]; dropped: Competency[]; warnings: string[] } {
  let comps = orderByPrerequisites(competenciesForTarget(map, intake.target));
  const dropped: Competency[] = [];
  const warnings: string[] = [];
  const hours = (list: Competency[]) => list.reduce((s, c) => s + estimateHours(c, intake, emphasis[c.key] ?? 1), 0);
  const weeks = (list: Competency[]) => Math.ceil(hours(list) / intake.hoursPerWeek);

  if (intake.deadlineWeeks && weeks(comps) > intake.deadlineWeeks) {
    for (const level of ['optional', 'supporting'] as const) {
      if (weeks(comps) <= intake.deadlineWeeks) break;
      const needed = new Set(comps.filter((c) => c.importance !== level).flatMap((c) => c.prerequisites ?? []));
      const cut = comps.filter((c) => c.importance === level && !needed.has(c.key));
      dropped.push(...cut);
      comps = comps.filter((c) => !cut.includes(c));
    }
    if (dropped.length) warnings.push(`To fit ${intake.deadlineWeeks} weeks, left out: ${dropped.map((c) => c.title).join(', ')}.`);
    if (weeks(comps) > intake.deadlineWeeks) {
      const need = Math.ceil(hours(comps) / intake.deadlineWeeks);
      warnings.push(`The core topics alone need about ${need} h/week to finish in ${intake.deadlineWeeks} weeks (you have ${intake.hoursPerWeek}). The plan runs ${weeks(comps)} weeks instead.`);
    }
  }
  return { comps, dropped, warnings };
}

/**
 * Groups ordered competencies into phases by the map's groups, never placing
 * a competency before something it depends on, then merges the smallest
 * neighbours until there are at most MAX_PHASES.
 */
export function groupIntoPhases(comps: Competency[], hoursOf: (c: Competency) => number): Competency[][] {
  const groupIndex = new Map<string, number>();
  for (const c of comps) if (!groupIndex.has(c.group)) groupIndex.set(c.group, groupIndex.size);
  const phaseOf = new Map<string, number>();
  for (const c of comps) {
    const afterPrereqs = Math.max(-1, ...(c.prerequisites ?? []).map((p) => phaseOf.get(p) ?? -1));
    phaseOf.set(c.key, Math.max(groupIndex.get(c.group)!, afterPrereqs));
  }
  let phases: Competency[][] = [];
  for (const c of comps) (phases[phaseOf.get(c.key)!] ??= []).push(c);
  phases = phases.filter((p) => p && p.length);

  const size = (p: Competency[]) => p.reduce((s, c) => s + hoursOf(c), 0);
  while (phases.length > MAX_PHASES) {
    let best = 0;
    for (let i = 1; i < phases.length - 1; i++) {
      if (size(phases[i]) + size(phases[i + 1]) < size(phases[best]) + size(phases[best + 1])) best = i;
    }
    phases.splice(best, 2, [...phases[best], ...phases[best + 1]]);
  }
  return phases;
}

const searchUrl = (title: string) => `https://www.google.com/search?q=${encodeURIComponent(title)}`;

export function catalogToDraft(r: CatalogResource, role: ResourceRole = r.role): DraftResource {
  return { catalogKey: r.key, title: r.title, url: r.url, source: 'catalog', quality: 'curated', pricing: r.pricing, role, type: r.type };
}

/** A resource the AI named but we don't curate: an honest search link, never an invented URL. */
export function namedToDraft(title: string, type: DraftResource['type'] = 'BOOK', role: ResourceRole = 'primary'): DraftResource {
  return { catalogKey: null, title, url: searchUrl(title), source: 'ai', quality: 'unreviewed', pricing: 'unknown', role, type };
}

function pickResources(field: string, shape: Shape, comps: Competency[], intake: Intake, curated: boolean): DraftResource[] {
  if (shape === 'reading' && intake.bookTitle) return [namedToDraft(intake.bookTitle, 'BOOK', 'primary')];
  if (!curated) return [];
  const q = {
    field, competencyKeys: comps.map((c) => c.key), budget: intake.budget,
    formats: intake.formats, level: intake.currentLevel,
  };
  const out: DraftResource[] = [];
  const take = (role: ResourceRole) => {
    const r = findCatalogResources({ ...q, role }).find((x) => x.role === role && !out.some((o) => o.catalogKey === x.key));
    if (r) out.push(catalogToDraft(r));
  };
  if (shape === 'project' || shape === 'practice') {
    take('practice');
    if (!out.length) take('primary');
    return out;
  }
  take('primary');
  if (!out.length) {
    const any = findCatalogResources(q)[0];
    if (any) out.push(catalogToDraft(any, 'primary'));
  }
  if (comps.some((c) => c.kind === 'algorithm' || c.kind === 'design')) take('practice');
  take('reference');
  return out.slice(0, 3);
}

const ITEM_TITLE: Record<Shape, (map: CompetencyMap, phaseTitle: string, comps: Competency[], intake: Intake) => string> = {
  course: (m, p) => `${m.title}: ${p}`,
  exploration: (m, p) => `${m.title}: ${p} (explore)`,
  reading: (_m, p, _c, i) => `${i.bookTitle}: ${p}`,
  practice: (_m, p, c) => (c.length === 1 ? c[0].title : `${p}: practice`),
  project: (_m, _p, c) => c.map((x) => x.title).join(' + '),
};

const SHAPE_ORDER: Shape[] = ['course', 'reading', 'exploration', 'practice', 'project'];

export interface SkeletonOptions {
  field: string;
  mapQuality: 'curated' | 'approved_draft';
  emphasis?: Record<string, number>;
  phaseTitles?: Record<number, string>;
  focus?: Record<string, string>;
}

export function buildSkeleton(map: CompetencyMap, intake: Intake, opts: SkeletonOptions): ProgramDraft {
  const emphasis = opts.emphasis ?? {};
  const curated = opts.mapQuality === 'curated';
  const hoursOf = (c: Competency) => estimateHours(c, intake, emphasis[c.key] ?? 1);
  const { comps, warnings } = scopeCompetencies(map, intake, emphasis);
  const groups = groupIntoPhases(comps, hoursOf);

  const phases: DraftPhase[] = groups.map((pcomps, i) => {
    const phase = i + 1;
    const groupNames = pcomps.map((c) => c.group).filter((g, j, a) => a.indexOf(g) === j);
    const title = opts.phaseTitles?.[phase] || groupNames.join(' & ');
    const phaseHours = pcomps.reduce((s, c) => s + hoursOf(c), 0);
    const weeks = Math.max(1, Math.ceil(phaseHours / intake.hoursPerWeek));

    const byShape = new Map<Shape, Competency[]>();
    for (const c of pcomps) {
      const s = shapeFor(c, intake);
      byShape.set(s, [...(byShape.get(s) ?? []), c]);
    }
    const items: DraftItem[] = SHAPE_ORDER.filter((s) => byShape.has(s)).map((shape) => {
      const icomps = byShape.get(shape)!;
      const itemHours = icomps.reduce((s, c) => s + hoursOf(c), 0);
      const id = `p${phase}-${shape}`;
      return {
        id, phase, shape,
        title: ITEM_TITLE[shape](map, title, icomps, intake),
        competencyKeys: icomps.map((c) => c.key),
        hoursPerWeek: round1(itemHours / weeks),
        weeks,
        resources: pickResources(opts.field, shape, icomps, intake, curated),
        ...(opts.focus?.[id] ? { focus: opts.focus[id] } : {}),
      };
    });
    return {
      phase, title, weeks, items,
      checkpoint: {
        title: `Phase ${phase} checkpoint`,
        competencyKeys: pcomps.filter((c) => c.importance !== 'optional').map((c) => c.key),
      },
    };
  });

  const itemsByComp = new Map<string, string[]>();
  for (const p of phases) for (const it of p.items) for (const k of it.competencyKeys) itemsByComp.set(k, [...(itemsByComp.get(k) ?? []), it.id]);
  const coverage: CoverageRow[] = competenciesForTarget(map, intake.target).map((c) => ({
    key: c.key, title: c.title, importance: c.importance, itemIds: itemsByComp.get(c.key) ?? [],
  }));

  if (!curated && !intake.bookTitle) warnings.push('There are no curated resources for this field yet. Add sources you trust to each item.');

  return {
    field: opts.field,
    mapQuality: opts.mapQuality,
    map,
    intake,
    phases,
    hoursPerWeek: intake.hoursPerWeek,
    totalWeeks: phases.reduce((s, p) => s + p.weeks, 0),
    whyThisPlan: '',
    coverage,
    warnings,
  };
}
