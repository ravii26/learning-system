/**
 * Backfill: promotes Topic.knowledgeMap.concepts[] (JSON) into real Concept
 * rows. Part of Phase 3 (the Concept slice) of the V2 migration plan.
 *
 * Properties this script must hold, per the migration plan:
 *   - Idempotent: upserts keyed on (topicId, legacyId). Safe to run twice.
 *   - Non-destructive: only ever reads Topic.knowledgeMap, never writes it.
 *   - Two-pass: parentId references another concept's legacyId, which may
 *     not have a row yet on pass one, so parent links are resolved in a
 *     second pass after every concept in the topic has a row.
 *   - Per-topic transaction: one topic's concepts commit or roll back
 *     together, not the whole run — a bad row in topic #14 shouldn't be
 *     able to roll back topic #3's already-verified backfill.
 *   - Loud: every topic reports found/created/updated/skipped with reasons.
 *     A silent skip is how 40 concepts quietly vanish.
 *
 * Usage:
 *   npx tsx prisma/scripts/backfill/003_concepts.ts --dry-run   # report only, no writes
 *   npx tsx prisma/scripts/backfill/003_concepts.ts             # apply
 *
 * `dotenv/config` is required at the top because this runs via a bare tsx
 * invocation, not through Next.js — Next loads .env automatically, tsx does
 * not.
 */
import 'dotenv/config';
import { PrismaClient, type MasteryLevel } from '@prisma/client';
import { labelToEnum } from '../../../src/lib/masteryLevel';
import { seedFromLegacy } from '../../../src/lib/fsrs';

const db = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

interface LegacyConcept {
  id: string; // the old Math.random().toString(36) id
  title: string;
  parentId?: string | null;
  status?: string;
  difficulty?: string;
  importance?: string;
  nextReviewDate?: string | null;
  reviewIntervalDays?: number;
  consecutiveRecalls?: number;
  lastRecalledAt?: string | null;
}

interface TopicReport {
  topicId: string;
  topicTitle: string;
  found: number;
  created: number;
  updated: number;
  parentLinksResolved: number;
  skipped: Array<{ legacyId: string; reason: string }>;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes will be made ===\n' : '=== LIVE RUN ===\n');

  const topics = await db.topic.findMany({
    select: { id: true, userId: true, title: true, knowledgeMap: true },
  });

  const reports: TopicReport[] = [];

  for (const topic of topics) {
    const map = topic.knowledgeMap as { concepts?: LegacyConcept[] } | null;
    const concepts = Array.isArray(map?.concepts) ? (map!.concepts as LegacyConcept[]) : [];
    if (concepts.length === 0) continue;

    const report: TopicReport = {
      topicId: topic.id,
      topicTitle: topic.title,
      found: concepts.length,
      created: 0,
      updated: 0,
      parentLinksResolved: 0,
      skipped: [],
    };

    // De-dupe legacyIds within this topic. Old ids are 7-char Math.random()
    // base36 strings from 18 generation call sites — collisions within a
    // topic are unlikely but not impossible. Fail loudly, don't pick one.
    const seenIds = new Set<string>();
    const uniqueConcepts: LegacyConcept[] = [];
    for (const c of concepts) {
      if (!c || !c.id) {
        report.skipped.push({ legacyId: '(missing)', reason: 'concept has no id' });
        continue;
      }
      if (seenIds.has(c.id)) {
        report.skipped.push({ legacyId: c.id, reason: 'duplicate legacyId within this topic' });
        continue;
      }
      seenIds.add(c.id);
      uniqueConcepts.push(c);
    }

    const legacyToRowId = new Map<string, string>();

    const runTopic = async (tx: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => {
      // Pass 1: upsert every concept's own fields (not parentId yet).
      for (const c of uniqueConcepts) {
        const seeded = seedFromLegacy({
          reviewIntervalDays: c.reviewIntervalDays,
          consecutiveRecalls: c.consecutiveRecalls,
          lastRecalledAt: c.lastRecalledAt,
          status: c.status,
        });

        const existing = await tx.concept.findFirst({ where: { topicId: topic.id, legacyId: c.id } });

        const data = {
          userId: topic.userId,
          topicId: topic.id,
          title: c.title?.trim() || 'Untitled concept',
          masteryLevel: labelToEnum(c.status) as MasteryLevel,
          difficultyTag: c.difficulty ?? null,
          importance: c.importance ?? null,
          state: seeded.state,
          stability: seeded.stability,
          difficulty: seeded.difficulty,
          reps: seeded.reps,
          lapses: seeded.lapses,
          lastReview: seeded.lastReview,
          nextReview: c.nextReviewDate ? new Date(c.nextReviewDate) : null,
          elapsedDays: 0,
          scheduledDays: c.reviewIntervalDays ?? 0,
          seededFromLegacy: true,
          legacyId: c.id,
        };

        if (DRY_RUN) {
          legacyToRowId.set(c.id, existing?.id ?? '(would-create)');
          if (existing) report.updated++;
          else report.created++;
          continue;
        }

        if (existing) {
          const row = await tx.concept.update({ where: { id: existing.id }, data });
          legacyToRowId.set(c.id, row.id);
          report.updated++;
        } else {
          const row = await tx.concept.create({ data });
          legacyToRowId.set(c.id, row.id);
          report.created++;
        }
      }

      // Pass 2: resolve parentId now that every legacyId in this topic has a row.
      if (!DRY_RUN) {
        for (const c of uniqueConcepts) {
          if (!c.parentId) continue;
          const parentRowId = legacyToRowId.get(c.parentId);
          if (!parentRowId || parentRowId === '(would-create)') {
            report.skipped.push({
              legacyId: c.id,
              reason: `parentId "${c.parentId}" does not match any concept in this topic`,
            });
            continue;
          }
          const rowId = legacyToRowId.get(c.id)!;
          await tx.concept.update({ where: { id: rowId }, data: { parentId: parentRowId } });
          report.parentLinksResolved++;
        }
      }
    };

    if (DRY_RUN) {
      // No transaction needed for a read-only dry run.
      await runTopic(db);
    } else {
      // Atomic per topic: one bad row in topic N must not roll back
      // topic N-1's already-committed backfill.
      await db.$transaction(async (tx) => runTopic(tx as unknown as PrismaClient));
    }

    reports.push(report);
  }

  console.log('--- Per-topic report ---');
  for (const r of reports) {
    console.log(
      `${r.topicTitle} (${r.topicId.slice(0, 8)}…): found=${r.found} created=${r.created} updated=${r.updated} parentLinks=${r.parentLinksResolved} skipped=${r.skipped.length}`
    );
    for (const s of r.skipped) {
      console.log(`    SKIPPED ${s.legacyId}: ${s.reason}`);
    }
  }

  const totals = reports.reduce(
    (acc, r) => ({
      found: acc.found + r.found,
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      skipped: acc.skipped + r.skipped.length,
    }),
    { found: 0, created: 0, updated: 0, skipped: 0 }
  );

  console.log('\n--- Totals ---');
  console.log(`topics with concepts: ${reports.length}`);
  console.log(`found: ${totals.found}  created: ${totals.created}  updated: ${totals.updated}  skipped: ${totals.skipped}`);

  if (totals.skipped > 0) {
    console.warn(`\n⚠️  ${totals.skipped} concept(s) skipped — review the reasons above before trusting the migration.`);
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
