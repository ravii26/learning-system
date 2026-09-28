import type { CompetencyMap } from '@/data/competencies';
import { buildSkeleton, namedToDraft, type TrustedResource } from './skeleton';
import { EMPTY_ADJUSTMENTS, parseAdjustments, type Adjustments } from './adapt';
import { factualWhy } from './why';
import type { Intake, ProgramDraft } from './types';
import type { FoundResource } from './adapt';
import { titlesMatch } from '@/lib/resources/openLibrary';

export interface ComposeInput {
  map: CompetencyMap;
  field: string;
  mapQuality: 'curated' | 'approved_draft';
  intake: Intake;
  adjustments?: Adjustments;
  /** The learner's trusted resources for this field (their library). */
  trusted?: TrustedResource[];
  /** Items the learner removed on the draft screen. Their call, but coverage will show the gap. */
  removedItemIds?: string[];
}

/**
 * Skeleton + (sanitised) AI adjustments + learner edits → the draft shown on
 * screen. The server calls this again on approval with the same inputs, so
 * the saved program is rebuilt from trusted parts, never taken from the client.
 */
export function composeDraft(input: ComposeInput): ProgramDraft {
  const adj = input.adjustments ?? EMPTY_ADJUSTMENTS;
  const draft = buildSkeleton(input.map, input.intake, {
    field: input.field,
    mapQuality: input.mapQuality,
    emphasis: adj.emphasis,
    phaseTitles: adj.phaseTitles,
    focus: adj.focus,
    trusted: input.trusted,
  });

  const allItems = () => draft.phases.flatMap((p) => p.items);
  for (const f of adj.foundResources ?? []) {
    const item = allItems().find((it) => it.id === f.itemId);
    if (!item || item.resources.some((x) => x.url === f.url)) continue;
    // A verified find replaces the search-link version of the same title.
    item.resources = item.resources.filter((x) => !(x.source === 'ai' && titlesMatch(x.title, f.title)));
    item.resources.push({
      catalogKey: null, title: f.title, url: f.url, source: 'search', quality: 'unreviewed',
      pricing: 'unknown', role: item.resources.length ? 'supplementary' : 'primary', type: f.type,
    });
  }
  for (const r of adj.namedResources) {
    const item = draft.phases.flatMap((p) => p.items).find((it) => it.id === r.itemId);
    if (item && !item.resources.some((x) => x.title === r.title || titlesMatch(x.title, r.title))) {
      item.resources.push(namedToDraft(r.title, r.type, item.resources.length ? 'supplementary' : 'primary'));
    }
  }

  const removed = new Set(input.removedItemIds ?? []);
  if (removed.size) {
    for (const p of draft.phases) p.items = p.items.filter((it) => !removed.has(it.id));
    draft.phases = draft.phases.filter((p) => p.items.length);
    for (const row of draft.coverage) row.itemIds = row.itemIds.filter((id) => !removed.has(id));
  }
  const uncovered = draft.coverage.filter((c) => c.importance === 'core' && c.itemIds.length === 0);
  if (uncovered.length && removed.size) {
    draft.warnings.push(`Not covered after your edits: ${uncovered.map((c) => c.title).join(', ')}.`);
  }

  draft.whyThisPlan = adj.whyThisPlan ?? factualWhy(draft);
  return draft;
}

/**
 * Re-sanitises adjustments that came back from the client with a draft:
 * the same clamps as the AI's reply, so a tampered request can only nudge
 * emphasis within bounds, never add content.
 */
export function sanitizeClientAdjustments(raw: unknown, input: Omit<ComposeInput, 'adjustments'>): Adjustments {
  if (!raw || typeof raw !== 'object') return EMPTY_ADJUSTMENTS;
  const skeleton = buildSkeleton(input.map, input.intake, { field: input.field, mapQuality: input.mapQuality });
  const adj = parseAdjustments(JSON.stringify(raw), skeleton);
  // Found links only keep their shape here; the approve route re-checks every URL.
  // Item ids come from the plan *with* emphasis — the one the draft screen showed.
  const withEmphasis = buildSkeleton(input.map, input.intake, { field: input.field, mapQuality: input.mapQuality, emphasis: adj.emphasis });
  const itemIds = new Set(withEmphasis.phases.flatMap((p) => p.items.map((it) => it.id)));
  const found = (raw as { foundResources?: unknown }).foundResources;
  adj.foundResources = (Array.isArray(found) ? found : [])
    .filter((f: any): f is FoundResource =>
      f && itemIds.has(f.itemId) && typeof f.title === 'string' && typeof f.url === 'string' && /^https:\/\//.test(f.url)
      && ['BOOK', 'COURSE', 'VIDEO', 'ARTICLE'].includes(f.type) && ['openlibrary', 'web', 'youtube'].includes(f.via))
    .slice(0, 30)
    .map((f) => ({ itemId: f.itemId, title: f.title.slice(0, 160), url: f.url.slice(0, 500), type: f.type, via: f.via }));
  return adj;
}
