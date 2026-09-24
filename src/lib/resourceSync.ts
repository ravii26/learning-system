/**
 * JSON<->row sync for Resource. Same pattern as curriculumSync.ts, with
 * one wrinkle: legacy Topic.resources entries have no ids — the UI edits
 * them by array index. So an id-less incoming entry is first matched to an
 * unclaimed existing row with the same title+url+type (each row claimed at
 * most once, so two identical bookmarks stay two rows), and only then
 * created fresh with a new legacyId. The rebuilt mirror carries ids, so
 * once a topic has been synced its entries are matched by id from then on.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ResourceJson {
  id?: string;
  title: string;
  type: string;
  url: string;
  purpose: string;
  status: string;
  notes: string;
}

export interface ResourceRowLike {
  legacyId: string;
  title: string;
  type: string;
  url: string;
}

const newLegacyId = () => `r${Math.random().toString(36).substring(2, 9)}`;
const contentKey = (r: { title?: unknown; url?: unknown; type?: unknown }) =>
  `${String(r.title ?? '').trim()}\u0000${String(r.url ?? '').trim()}\u0000${String(r.type ?? 'OTHER')}`;

export function resourceJsonToRowData(j: Partial<ResourceJson>, order: number) {
  return {
    order,
    title: String(j.title ?? '').trim() || 'Untitled resource',
    type: typeof j.type === 'string' && j.type ? j.type : 'OTHER',
    url: typeof j.url === 'string' ? j.url.trim() : '',
    purpose: typeof j.purpose === 'string' ? j.purpose : '',
    status: typeof j.status === 'string' && j.status ? j.status : 'NOT_STARTED',
    notes: typeof j.notes === 'string' ? j.notes : '',
  };
}

export function resourceRowToJson(row: ResourceRowLike & { purpose: string; status: string; notes: string }): ResourceJson {
  return { id: row.legacyId, title: row.title, type: row.type, url: row.url, purpose: row.purpose, status: row.status, notes: row.notes };
}

export interface ResourceSyncPlan {
  upserts: Array<{ legacyId: string; isNew: boolean; data: ReturnType<typeof resourceJsonToRowData> }>;
  removeLegacyIds: string[];
}

/** Pure: decides what to write — see the module comment for the id-less matching rule. */
export function planResourceSync(activeRows: ResourceRowLike[], incoming: Array<Partial<ResourceJson>>): ResourceSyncPlan {
  const byId = new Map(activeRows.map((r) => [r.legacyId, r]));
  const claimed = new Set<string>();
  const upserts: ResourceSyncPlan['upserts'] = [];

  // Pass 1: entries that carry an id claim their row first, so an id-less
  // duplicate can't steal it by content in pass 2.
  const withId = new Map<number, string>();
  incoming.forEach((item, i) => {
    if (item && typeof item.id === 'string' && item.id && !claimed.has(item.id)) {
      claimed.add(item.id);
      withId.set(i, item.id);
    }
  });

  incoming.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const data = resourceJsonToRowData(item, i);
    const explicit = withId.get(i);
    if (explicit) {
      upserts.push({ legacyId: explicit, isNew: !byId.has(explicit), data });
      return;
    }
    if (typeof item.id === 'string' && item.id) return; // duplicate id — first occurrence wins
    const key = contentKey(item);
    const match = activeRows.find((r) => !claimed.has(r.legacyId) && contentKey(r) === key);
    if (match) {
      claimed.add(match.legacyId);
      upserts.push({ legacyId: match.legacyId, isNew: false, data });
    } else {
      const legacyId = newLegacyId();
      claimed.add(legacyId);
      upserts.push({ legacyId, isNew: true, data });
    }
  });

  return { upserts, removeLegacyIds: activeRows.map((r) => r.legacyId).filter((id) => !claimed.has(id)) };
}

export async function mirrorResourcesToJson(db: DbClient, topicId: string): Promise<ResourceJson[]> {
  const rows = await db.resource.findMany({
    where: { topicId, removed: false },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(resourceRowToJson);
}

export async function syncResourcesFromJson(
  db: DbClient,
  userId: string,
  topicId: string,
  incoming: Array<Partial<ResourceJson>>
): Promise<ResourceJson[]> {
  const active = await db.resource.findMany({
    where: { topicId, removed: false },
    select: { legacyId: true, title: true, type: true, url: true },
  });
  const plan = planResourceSync(active, incoming);

  for (const { legacyId, data } of plan.upserts) {
    await db.resource.upsert({
      where: { topicId_legacyId: { topicId, legacyId } },
      create: { ...data, legacyId, userId, topicId },
      update: { ...data, removed: false },
    });
  }
  if (plan.removeLegacyIds.length > 0) {
    await db.resource.updateMany({ where: { topicId, legacyId: { in: plan.removeLegacyIds } }, data: { removed: true } });
  }
  return mirrorResourcesToJson(db, topicId);
}
