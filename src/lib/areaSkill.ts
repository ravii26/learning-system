import type { PrismaClient, Prisma } from '@prisma/client';
import { slugifySkillName } from './skillSlug';
import { VALID_AREAS } from './validations/topic';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Returns the id of the `kind: area` root Skill for a topic's area,
 * creating it if missing. Topics used to link to a skill only when created
 * through POST /api/goals, and only if the Phase 6 backfill had already
 * seeded the roots — so a topic made from the board or Today never counted
 * toward "Where You Stand", and a fresh database had no roots at all.
 * Unknown areas fall back to "Other" rather than inventing new roots.
 */
export async function ensureAreaSkillId(db: DbClient, userId: string, area: string | null | undefined): Promise<string> {
  const name = area && VALID_AREAS.includes(area) ? area : 'Other';
  const slug = slugifySkillName(name);
  const skill = await db.skill.upsert({
    where: { userId_slug: { userId, slug } },
    create: { userId, name, slug, kind: 'area', path: [], depth: 0 },
    update: {},
    select: { id: true },
  });
  return skill.id;
}
