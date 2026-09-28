import { CATALOG } from './catalog';
import type { CatalogResource, ResourceFormat, ResourceRole } from './types';

export * from './types';
export { CATALOG };

/** Intake budget. Freemium counts as usable on free-only (it has a real free tier). */
export type Budget = 'free_only' | 'free_preferred' | 'any';

export interface ResourceQuery {
  field: string;
  competencyKeys?: string[];
  budget?: Budget;
  formats?: ResourceFormat[];
  level?: 'beginner' | 'intermediate' | 'advanced';
  role?: ResourceRole;
}

export function getCatalogResource(key: string): CatalogResource | null {
  return CATALOG.find((r) => r.key === key) ?? null;
}

export function allowedByBudget(r: CatalogResource, budget: Budget = 'any'): boolean {
  return budget !== 'free_only' || r.pricing === 'free' || r.pricing === 'freemium';
}

const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

/**
 * Catalogue resources for a field, best first. Scoring prefers: specific
 * coverage of the asked competencies, the asked role, preferred format,
 * free when the budget leans free, and a level close to the learner's.
 * Pure and deterministic, so the same intake always gets the same picks.
 */
export function findCatalogResources(q: ResourceQuery): CatalogResource[] {
  const wanted = new Set(q.competencyKeys ?? []);
  const scored = CATALOG
    .filter((r) => r.fields.includes(q.field) && allowedByBudget(r, q.budget))
    .map((r) => {
      const specific = r.competencyKeys.filter((k) => wanted.has(k)).length;
      const general = r.competencyKeys.length === 0;
      if (wanted.size > 0 && specific === 0 && !general) return null; // covers other competencies only
      let score = specific * 4 + (general ? 1 : 0);
      if (q.role && r.role === q.role) score += 5;
      if (r.role === 'primary') score += 2;
      if (q.formats?.length && q.formats.includes(r.format)) score += 2;
      if (q.budget === 'free_preferred' && r.pricing === 'free') score += 1;
      if (q.level && r.level !== 'all') score -= Math.abs(LEVEL_RANK[q.level] - LEVEL_RANK[r.level]);
      return { r, score };
    })
    .filter((x): x is { r: CatalogResource; score: number } => x !== null)
    .sort((a, b) => b.score - a.score || a.r.key.localeCompare(b.r.key));
  return scored.map((x) => x.r);
}
