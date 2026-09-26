/**
 * JSON<->row sync for CurriculumItem, same pattern as sessionLogSync.ts.
 * Topic.curriculum is always written as a whole array (CurriculumView's
 * onSaveCurriculum, topic creation, the goals roadmap), so the incoming
 * array is reconciled against rows and the canonical JSON is rebuilt from
 * rows. Missing items are soft-removed (removed=true), never hard-deleted.
 *
 * Every module keeps its JSON id as legacyId: GeneratedLesson.moduleId and
 * SessionLog.moduleId point at it.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface CurriculumJson {
  id: string;
  order: number;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
  completedAt: string | null;
  notes: string;
}

export interface CurriculumRowLike {
  id: string;
  legacyId: string;
  order: number;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
  completedAt: Date | null;
  notes: string;
}

const newLegacyId = () => Math.random().toString(36).substring(2, 9);

export function curriculumRowToJson(row: CurriculumRowLike): CurriculumJson {
  return {
    id: row.legacyId,
    order: row.order,
    title: row.title,
    estimatedMinutes: row.estimatedMinutes,
    completed: row.completed,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
  };
}

export function curriculumJsonToRowData(j: Partial<CurriculumJson>, fallbackOrder: number) {
  const minutes = Number(j.estimatedMinutes);
  return {
    order: typeof j.order === 'number' && Number.isFinite(j.order) ? j.order : fallbackOrder,
    title: String(j.title ?? '').trim() || 'Untitled module',
    estimatedMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 30,
    completed: Boolean(j.completed),
    completedAt: j.completed && j.completedAt ? new Date(j.completedAt) : null,
    notes: typeof j.notes === 'string' ? j.notes : '',
  };
}

export interface CurriculumSyncPlan {
  upserts: Array<{ legacyId: string; data: ReturnType<typeof curriculumJsonToRowData> }>;
  removeLegacyIds: string[];
}

/**
 * Pure: decides what to write. Duplicate ids keep the first occurrence;
 * items with no id get a fresh one (so they can be referenced later);
 * active rows absent from the incoming array are marked for removal.
 */
export function planCurriculumSync(activeLegacyIds: string[], incoming: Array<Partial<CurriculumJson>>): CurriculumSyncPlan {
  const seen = new Set<string>();
  const upserts: CurriculumSyncPlan['upserts'] = [];
  incoming.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const legacyId = typeof item.id === 'string' && item.id ? item.id : newLegacyId();
    if (seen.has(legacyId)) return;
    seen.add(legacyId);
    upserts.push({ legacyId, data: curriculumJsonToRowData(item, i + 1) });
  });
  return { upserts, removeLegacyIds: activeLegacyIds.filter((id) => !seen.has(id)) };
}

export async function mirrorCurriculumToJson(db: DbClient, topicId: string): Promise<CurriculumJson[]> {
  const rows = await db.curriculumItem.findMany({
    where: { topicId, removed: false },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(curriculumRowToJson);
}

export async function syncCurriculumFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: Array<Partial<CurriculumJson>>
): Promise<CurriculumJson[]> {
  const active = await db.curriculumItem.findMany({ where: { topicId, removed: false }, select: { legacyId: true } });
  const plan = planCurriculumSync(active.map((r) => r.legacyId), incoming);

  for (const { legacyId, data } of plan.upserts) {
    // Notes are only set on create. After that they belong to the module
    // notes route: the topic page re-sends the whole syllabus whenever a
    // module is ticked or reordered, and its copy of a note can be seconds
    // stale — letting that overwrite the row would lose what you just typed.
    const { notes: _notes, ...structural } = data;
    await db.curriculumItem.upsert({
      where: { topicId_legacyId: { topicId, legacyId } },
      create: { ...data, legacyId, userId, topicId },
      update: { ...structural, removed: false },
    });
  }
  if (plan.removeLegacyIds.length > 0) {
    await db.curriculumItem.updateMany({ where: { topicId, legacyId: { in: plan.removeLegacyIds } }, data: { removed: true } });
  }
  return mirrorCurriculumToJson(db, topicId);
}
