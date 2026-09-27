import type { CompetencyMap } from '@/data/competencies';
import { buildSkeleton, namedToDraft } from './skeleton';
import { EMPTY_ADJUSTMENTS, parseAdjustments, type Adjustments } from './adapt';
import { factualWhy } from './why';
import type { Intake, ProgramDraft } from './types';

export interface ComposeInput {
  map: CompetencyMap;
  field: string;
  mapQuality: 'curated' | 'approved_draft';
  intake: Intake;
  adjustments?: Adjustments;
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
  });

  for (const r of adj.namedResources) {
    const item = draft.phases.flatMap((p) => p.items).find((it) => it.id === r.itemId);
    if (item && !item.resources.some((x) => x.title === r.title)) {
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
  return parseAdjustments(JSON.stringify(raw), skeleton);
}
