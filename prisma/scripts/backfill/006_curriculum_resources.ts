/**
 * Backfill: promotes Topic.curriculum and Topic.resources (JSON arrays)
 * into CurriculumItem and Resource rows — the last two JSON lists the
 * migration plan extracts (Phase 5 leftover).
 *
 *   - Idempotent: rows are upserted on (topicId, legacyId); id-less
 *     resources are matched by title+url+type (src/lib/resourceSync.ts), so
 *     a second run creates nothing.
 *   - One transaction per topic. Soft-deleted topics included, so a
 *     restored topic has its rows.
 *   - Writes the rebuilt mirror back to the JSON columns (this adds ids to
 *     legacy id-less resources, which is what makes the UI's later edits
 *     match by id) — BUT only when every entry's keys are ones the mirror
 *     preserves. A topic with unknown keys keeps its JSON untouched and is
 *     reported, so no field is ever silently dropped.
 *   - Loud: per-topic counts, then a verification that every topic's
 *     active row count equals its JSON array length.
 *
 * Usage:
 *   npx tsx prisma/scripts/backfill/006_curriculum_resources.ts --dry-run
 *   npx tsx prisma/scripts/backfill/006_curriculum_resources.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { planCurriculumSync, syncCurriculumFromJson } from '../../../src/lib/curriculumSync';
import { planResourceSync, syncResourcesFromJson } from '../../../src/lib/resourceSync';

const db = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const CURRICULUM_KEYS = new Set(['id', 'order', 'title', 'estimatedMinutes', 'completed', 'completedAt', 'notes']);
const RESOURCE_KEYS = new Set(['id', 'title', 'type', 'url', 'purpose', 'status', 'notes']);

function unknownKeys(items: unknown[], known: Set<string>): string[] {
  const out = new Set<string>();
  for (const it of items) {
    if (it && typeof it === 'object') for (const k of Object.keys(it)) if (!known.has(k)) out.add(k);
  }
  return Array.from(out);
}

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes will be made ===\n' : '=== LIVE RUN ===\n');

  const topics = await db.topic.findMany({ select: { id: true, userId: true, title: true, curriculum: true, resources: true } });
  let totals = { currCreate: 0, currUpdate: 0, currRemove: 0, resCreate: 0, resUpdate: 0, resRemove: 0, mirrorSkipped: 0 };

  for (const t of topics) {
    const curr = asArray(t.curriculum);
    const res = asArray(t.resources);
    const badCurr = unknownKeys(curr, CURRICULUM_KEYS);
    const badRes = unknownKeys(res, RESOURCE_KEYS);

    const [activeCurr, activeRes] = await Promise.all([
      db.curriculumItem.findMany({ where: { topicId: t.id, removed: false }, select: { legacyId: true } }),
      db.resource.findMany({ where: { topicId: t.id, removed: false }, select: { legacyId: true, title: true, type: true, url: true } }),
    ]);
    const cPlan = planCurriculumSync(activeCurr.map((r) => r.legacyId), curr);
    const rPlan = planResourceSync(activeRes, res);
    const activeCurrIds = new Set(activeCurr.map((r) => r.legacyId));
    const cCreate = cPlan.upserts.filter((u) => !activeCurrIds.has(u.legacyId)).length;
    const rCreate = rPlan.upserts.filter((u) => u.isNew).length;

    totals.currCreate += cCreate;
    totals.currUpdate += cPlan.upserts.length - cCreate;
    totals.currRemove += cPlan.removeLegacyIds.length;
    totals.resCreate += rCreate;
    totals.resUpdate += rPlan.upserts.length - rCreate;
    totals.resRemove += rPlan.removeLegacyIds.length;

    const writeMirror = badCurr.length === 0 && badRes.length === 0;
    if (!writeMirror) totals.mirrorSkipped++;

    console.log(
      `• ${t.title.slice(0, 50).padEnd(50)} curriculum ${curr.length} (+${cCreate} new, ${cPlan.upserts.length - cCreate} upd, ${cPlan.removeLegacyIds.length} rm) | ` +
        `resources ${res.length} (+${rCreate} new, ${rPlan.upserts.length - rCreate} upd, ${rPlan.removeLegacyIds.length} rm)` +
        (writeMirror ? '' : `  ⚠ JSON left untouched — unknown keys: ${[...badCurr, ...badRes].join(', ')}`)
    );

    if (DRY_RUN) continue;

    await db.$transaction(async (tx) => {
      const currMirror = await syncCurriculumFromJson(tx, t.userId, t.id, curr);
      const resMirror = await syncResourcesFromJson(tx, t.userId, t.id, res);
      if (writeMirror) {
        await tx.topic.update({ where: { id: t.id }, data: { curriculum: currMirror as object[], resources: resMirror as object[] } });
      }
    });
  }

  console.log('\nTotals:', totals);
  if (DRY_RUN) return;

  // Verification: active rows must equal JSON array length for every topic.
  const after = await db.topic.findMany({ select: { id: true, title: true, curriculum: true, resources: true } });
  let mismatches = 0;
  for (const t of after) {
    const [c, r] = await Promise.all([
      db.curriculumItem.count({ where: { topicId: t.id, removed: false } }),
      db.resource.count({ where: { topicId: t.id, removed: false } }),
    ]);
    if (c !== asArray(t.curriculum).length || r !== asArray(t.resources).length) {
      mismatches++;
      console.log(`✗ MISMATCH ${t.title}: curriculum rows ${c} vs json ${asArray(t.curriculum).length}; resource rows ${r} vs json ${asArray(t.resources).length}`);
    }
  }
  console.log(mismatches === 0 ? `\n✓ Verified: all ${after.length} topics have row counts equal to their JSON arrays.` : `\n✗ ${mismatches} topic(s) mismatched — investigate before relying on the rows.`);
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
