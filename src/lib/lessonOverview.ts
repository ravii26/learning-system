import { KIND_BLOCKS, isLessonKind, lessonKindOf, type LessonKind } from './lessonKinds';
import { normalizeBlueprint, type BlockType } from './lessonBlocks';

/**
 * One row per lesson across every topic, for the "All lessons" page. Pure, so
 * the rules (what counts as written, what needs regenerating) are testable.
 */

export interface OverviewRow {
  topicId: string;
  topicTitle: string;
  topicStatus: string;
  topicMode: string;
  moduleId: string;
  title: string;
  order: number;
  /** What the lesson is set to be. */
  kind: LessonKind;
  blueprint: BlockType[];
  completed: boolean;
  minutes: number;
  /** A lesson has been generated and saved. */
  written: boolean;
  /** The kind the saved lesson was written as; null if nothing is saved. */
  writtenKind: LessonKind | null;
  /** The lesson was changed to a different kind after it was written. */
  needsRegenerate: boolean;
}

export interface ModuleRowInput {
  topicId: string;
  topicTitle: string;
  topicStatus: string;
  topicMode: string;
  legacyId: string;
  title: string;
  order: number;
  kind: string | null;
  blueprint: unknown;
  completed: boolean;
  estimatedMinutes: number;
}

export function buildOverview(modules: ModuleRowInput[], saved: Array<{ topicId: string; moduleId: string; content: unknown }>): OverviewRow[] {
  const writtenAs = new Map<string, LessonKind>();
  for (const s of saved) {
    const kind = s.content && typeof s.content === 'object' ? lessonKindOf((s.content as Record<string, unknown>).kind) : 'concept';
    writtenAs.set(`${s.topicId}:${s.moduleId}`, kind);
  }
  return modules.map((m) => {
    const kind = isLessonKind(m.kind) ? m.kind : 'concept';
    const writtenKind = writtenAs.get(`${m.topicId}:${m.legacyId}`) ?? null;
    return {
      topicId: m.topicId,
      topicTitle: m.topicTitle,
      topicStatus: m.topicStatus,
      topicMode: m.topicMode,
      moduleId: m.legacyId,
      title: m.title,
      order: m.order,
      kind,
      blueprint: normalizeBlueprint(m.blueprint, KIND_BLOCKS[kind]),
      completed: m.completed,
      minutes: m.estimatedMinutes,
      written: writtenKind !== null,
      writtenKind,
      needsRegenerate: writtenKind !== null && writtenKind !== kind,
    };
  });
}

export type OverviewState = 'all' | 'not_written' | 'written' | 'needs_regenerate' | 'done';

export const STATE_LABEL: Record<OverviewState, string> = {
  all: 'Any state',
  not_written: 'Not written yet',
  written: 'Written',
  needs_regenerate: 'Needs regenerating',
  done: 'Finished',
};

export function filterOverview(rows: OverviewRow[], filter: { kind: LessonKind | 'all'; state: OverviewState }): OverviewRow[] {
  return rows.filter((r) => {
    if (filter.kind !== 'all' && r.kind !== filter.kind) return false;
    switch (filter.state) {
      case 'not_written': return !r.written;
      case 'written': return r.written;
      case 'needs_regenerate': return r.needsRegenerate;
      case 'done': return r.completed;
      default: return true;
    }
  });
}

export interface TopicGroup {
  topicId: string;
  topicTitle: string;
  topicStatus: string;
  topicMode: string;
  rows: OverviewRow[];
}

/** Rows grouped by topic, keeping the order the topics first appear in and each topic's lessons in order. */
export function groupByTopic(rows: OverviewRow[]): TopicGroup[] {
  const groups = new Map<string, TopicGroup>();
  for (const r of rows) {
    const g = groups.get(r.topicId) ?? { topicId: r.topicId, topicTitle: r.topicTitle, topicStatus: r.topicStatus, topicMode: r.topicMode, rows: [] };
    g.rows.push(r);
    groups.set(r.topicId, g);
  }
  groups.forEach((g) => g.rows.sort((a, b) => a.order - b.order));
  return Array.from(groups.values());
}

/** "3 lessons · 2 written · 1 needs regenerating" */
export function summarize(rows: OverviewRow[]): string {
  const written = rows.filter((r) => r.written).length;
  const stale = rows.filter((r) => r.needsRegenerate).length;
  const parts = [`${rows.length} lesson${rows.length === 1 ? '' : 's'}`, `${written} written`];
  if (stale) parts.push(`${stale} need${stale === 1 ? 's' : ''} regenerating`);
  return parts.join(' · ');
}
