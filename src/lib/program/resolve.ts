import { getMap, matchMap, type CompetencyMap } from '@/data/competencies';
import { sanitizeMap } from './mapDraft';

export type ResolvedMap =
  | { kind: 'map'; map: CompetencyMap; field: string; mapQuality: 'curated' | 'approved_draft' }
  | { kind: 'needs_map' }
  | { kind: 'invalid'; problems: string[] };

/**
 * Which competency map a request uses: an explicitly chosen curated field,
 * a map the learner reviewed and approved (sent back as customMap), a
 * curated map matched from the goal text — or none, meaning the AI must
 * draft one for review first.
 */
export function resolveMap(body: { field?: unknown; customMap?: unknown }, goal: string): ResolvedMap {
  if (body.customMap) {
    const { map, problems } = sanitizeMap(body.customMap, goal);
    return map ? { kind: 'map', map, field: 'custom', mapQuality: 'approved_draft' } : { kind: 'invalid', problems };
  }
  const chosen = typeof body.field === 'string' ? getMap(body.field) : null;
  const map = chosen ?? matchMap(goal);
  return map ? { kind: 'map', map, field: map.key, mapQuality: 'curated' } : { kind: 'needs_map' };
}
