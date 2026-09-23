/**
 * Backfill: converts the 6 hardcoded Topic.area values into `kind: area`
 * Skill roots, and points every Topic.skillId at the matching one. Part of
 * Phase 6 (the Skill tree) of the V2 migration plan.
 *
 * Deliberately does NOT try to derive a skill tree below the areas from
 * topic titles — per the migration plan, that's authored by hand or via AI
 * later, not inferred here. This script only creates the 6 area roots.
 *
 * Idempotent: upserts on (userId, slug), safe to run twice. Non-destructive:
 * never touches Topic.area, only adds skillId alongside it.
 *
 * Usage:
 *   npx tsx prisma/scripts/backfill/005_areas_to_skills.ts --dry-run
 *   npx tsx prisma/scripts/backfill/005_areas_to_skills.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { slugifySkillName } from '../../../src/lib/skillSlug';

const db = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// Matches VALID_AREAS in src/lib/validations/topic.ts.
const AREAS = ['Tech', 'Business', 'Finance', 'Creative', 'Personal', 'Other'];

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes will be made ===\n' : '=== LIVE RUN ===\n');

  const users = await db.user.findMany({ select: { id: true, email: true } });

  let skillsCreated = 0;
  let skillsUpdated = 0;
  let topicsLinked = 0;
  let topicsAlreadyLinked = 0;
  let topicsSkipped = 0;

  for (const user of users) {
    const slugToSkillId = new Map<string, string>();

    for (const area of AREAS) {
      const slug = slugifySkillName(area);
      const existing = await db.skill.findFirst({ where: { userId: user.id, slug } });
      const data = { userId: user.id, name: area, slug, kind: 'area' as const, path: [], depth: 0 };

      if (DRY_RUN) {
        if (existing) skillsUpdated++;
        else skillsCreated++;
        slugToSkillId.set(area, existing?.id ?? `(would-create:${slug})`);
        continue;
      }

      if (existing) {
        slugToSkillId.set(area, existing.id);
        skillsUpdated++;
      } else {
        const created = await db.skill.create({ data });
        slugToSkillId.set(area, created.id);
        skillsCreated++;
      }
    }

    const topics = await db.topic.findMany({ where: { userId: user.id }, select: { id: true, area: true, skillId: true } });
    for (const topic of topics) {
      if (topic.skillId) { topicsAlreadyLinked++; continue; }
      const skillId = slugToSkillId.get(topic.area);
      if (!skillId || skillId.startsWith('(would-create')) {
        if (DRY_RUN) { topicsLinked++; continue; }
        // area not in the known list (data drift) — leave unlinked, don't guess
        topicsSkipped++;
        continue;
      }
      if (DRY_RUN) { topicsLinked++; continue; }
      await db.topic.update({ where: { id: topic.id }, data: { skillId } });
      topicsLinked++;
    }

    console.log(`${user.email || user.id}: ${AREAS.length} area skills ensured, ${topics.length} topics considered`);
  }

  console.log('\n--- Totals ---');
  console.log(`skills created=${skillsCreated} updated(existing)=${skillsUpdated}`);
  console.log(`topics linked=${topicsLinked} already-linked=${topicsAlreadyLinked} skipped(unknown area)=${topicsSkipped}`);

  if (topicsSkipped > 0) {
    console.warn(`\n⚠️  ${topicsSkipped} topic(s) had an area outside the known list — review before trusting the migration.`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
