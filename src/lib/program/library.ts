import type { Prisma, PrismaClient } from '@prisma/client';
import { CURATED_MAPS, getMap, matchMap, validateMap, type CompetencyMap } from '@/data/competencies';
import { sanitizeMap, slug } from './mapDraft';
import type { TrustedResource } from './skeleton';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The learner's field library: their own versions of topic lists. Plans for
 * a field start from the learner's version first, then the built-in list,
 * then an AI draft. Personal — a learner's edits never change anyone else's.
 */

export interface FieldMapRow {
  key: string;
  title: string;
  aliases: string[];
  description: string;
  competencies: unknown;
  source: string;
  basedOn: string | null;
}

export function rowToMap(row: FieldMapRow): CompetencyMap {
  return {
    key: row.key,
    title: row.title,
    aliases: row.aliases,
    description: row.description,
    competencies: row.competencies as CompetencyMap['competencies'],
  };
}

export type ResolvedField =
  | {
      kind: 'map';
      map: CompetencyMap;
      field: string;
      /** 'curated' when built in, or the learner's copy of a built-in list (keeps its catalogue). */
      mapQuality: 'curated' | 'approved_draft';
      /** Where the list came from, for the UI: built in, your library, or a draft you just approved. */
      origin: 'builtin' | 'library' | 'approved';
    }
  | { kind: 'needs_map' }
  | { kind: 'invalid'; problems: string[] };

async function libraryMaps(db: Db, userId: string) {
  return db.fieldMap.findMany({
    where: { userId },
    select: { key: true, title: true, aliases: true, description: true, competencies: true, source: true, basedOn: true },
  });
}

const qualityOf = (row: FieldMapRow): 'curated' | 'approved_draft' => (row.basedOn && getMap(row.basedOn) ? 'curated' : 'approved_draft');

/**
 * Which topic list a plan uses: a list the learner just approved (customMap),
 * a field they picked, or one matched from the goal — their library first,
 * then built-in lists. None → the AI drafts one for review.
 */
export async function resolveFieldForUser(db: Db, userId: string, body: { field?: unknown; customMap?: unknown }, goal: string): Promise<ResolvedField> {
  if (body.customMap) {
    const { map, problems } = sanitizeMap(body.customMap, goal);
    if (!map) return { kind: 'invalid', problems };
    const key = slug(map.title);
    return { kind: 'map', map: { ...map, key }, field: key, mapQuality: 'approved_draft', origin: 'approved' };
  }
  const rows = await libraryMaps(db, userId);
  const chosen = typeof body.field === 'string' ? body.field : null;
  const byKey = chosen ? rows.find((r) => r.key === chosen) : null;
  if (byKey) return { kind: 'map', map: rowToMap(byKey), field: byKey.key, mapQuality: qualityOf(byKey), origin: 'library' };
  if (chosen && getMap(chosen)) return { kind: 'map', map: getMap(chosen)!, field: chosen, mapQuality: 'curated', origin: 'builtin' };

  const mine = matchMap(goal, rows.map(rowToMap));
  if (mine) {
    const row = rows.find((r) => r.key === mine.key)!;
    return { kind: 'map', map: mine, field: mine.key, mapQuality: qualityOf(row), origin: 'library' };
  }
  const builtIn = matchMap(goal);
  return builtIn ? { kind: 'map', map: builtIn, field: builtIn.key, mapQuality: 'curated', origin: 'builtin' } : { kind: 'needs_map' };
}

/** The learner's trusted resources for a field, in the shape the plan builder uses. */
export async function trustedResources(db: Db, userId: string, fieldKey: string): Promise<TrustedResource[]> {
  const rows = await db.fieldResource.findMany({ where: { userId, fieldKey }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({
    title: r.title, url: r.url, type: r.type as TrustedResource['type'], pricing: r.pricing as TrustedResource['pricing'],
    role: r.role as TrustedResource['role'], competencyKeys: r.competencyKeys,
  }));
}

/**
 * Validates a list the learner edited. Unlike AI drafts, existing keys are
 * kept (plans' evidence is keyed by them); new topics get a key from their title.
 */
export function sanitizeEditedMap(input: unknown, key: string, fallbackTitle: string): { map: CompetencyMap | null; problems: string[] } {
  // sanitizeMap re-slugs keys; the slug of an existing slug key is itself, so
  // evidence keyed by competency survives an edit.
  const res = sanitizeMap(input, fallbackTitle);
  if (!res.map) return res;
  const rawAliases = (input as { aliases?: unknown })?.aliases;
  const aliases = Array.isArray(rawAliases)
    ? rawAliases.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.toLowerCase().trim().slice(0, 60)).slice(0, 12)
    : [];
  const map: CompetencyMap = { ...res.map, key, aliases };
  const problems = validateMap(map);
  return problems.length ? { map: null, problems } : { map, problems: [] };
}

/** Saves (or replaces) a list in the learner's library. */
export async function saveFieldMap(
  db: Db, userId: string, map: CompetencyMap,
  meta: { source: 'ai' | 'edited' | 'shared'; basedOn?: string | null; sharedFromUserId?: string | null; sources?: Array<{ title: string; url: string }> | null },
) {
  const data = {
    title: map.title,
    aliases: map.aliases,
    description: map.description,
    competencies: map.competencies as unknown as Prisma.InputJsonValue,
    source: meta.source,
    basedOn: meta.basedOn ?? null,
    sharedFromUserId: meta.sharedFromUserId ?? null,
    ...(meta.sources ? { sources: meta.sources as unknown as Prisma.InputJsonValue } : {}),
  };
  return db.fieldMap.upsert({ where: { userId_key: { userId, key: map.key } }, create: { userId, key: map.key, ...data }, update: data });
}

export const BUILT_IN_FIELDS = CURATED_MAPS.map((m) => ({ key: m.key, title: m.title, topics: m.competencies.length }));
