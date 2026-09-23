/**
 * Backfill: promotes Topic.sessionLogs / pauseHistory / confusions /
 * mistakes (JSON arrays) into SessionLog, TopicPause, Confusion, and
 * Mistake rows. Part of Phase 5 (extractions) of the V2 migration plan.
 *
 * Same properties as 003_concepts.ts, applied to four simpler tables (none
 * of these have a parent-child hierarchy, so there's no two-pass step):
 *   - Idempotent: upserts keyed on (topicId, legacyId).
 *   - Non-destructive: only ever reads the Json columns, never writes them.
 *   - One transaction per topic, covering all four types together.
 *   - Loud: every topic reports found/created/updated/skipped per type.
 *
 * Mistake rows additionally attempt to resolve conceptId via an exact
 * title match against that topic's Concept rows — ambiguous or missing
 * matches are left null, never fuzzy-matched (per the migration plan).
 *
 * Usage:
 *   npx tsx prisma/scripts/backfill/004_extractions.ts --dry-run
 *   npx tsx prisma/scripts/backfill/004_extractions.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

interface Counts {
  found: number;
  created: number;
  updated: number;
  skipped: number;
}
const emptyCounts = (): Counts => ({ found: 0, created: 0, updated: 0, skipped: 0 });

interface TopicReport {
  topicId: string;
  topicTitle: string;
  sessionLog: Counts;
  topicPause: Counts;
  confusion: Counts;
  mistake: Counts;
  mistakeConceptMatches: number;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN — no writes will be made ===\n' : '=== LIVE RUN ===\n');

  const topics = await db.topic.findMany({
    select: {
      id: true,
      userId: true,
      title: true,
      sessionLogs: true,
      pauseHistory: true,
      confusions: true,
      mistakes: true,
    },
  });

  const reports: TopicReport[] = [];

  for (const topic of topics) {
    const sessionLogsJson = Array.isArray(topic.sessionLogs) ? (topic.sessionLogs as any[]) : [];
    const pauseHistoryJson = Array.isArray(topic.pauseHistory) ? (topic.pauseHistory as any[]) : [];
    const confusionsJson = Array.isArray(topic.confusions) ? (topic.confusions as any[]) : [];
    const mistakesJson = Array.isArray(topic.mistakes) ? (topic.mistakes as any[]) : [];

    if (
      sessionLogsJson.length === 0 &&
      pauseHistoryJson.length === 0 &&
      confusionsJson.length === 0 &&
      mistakesJson.length === 0
    ) {
      continue;
    }

    const report: TopicReport = {
      topicId: topic.id,
      topicTitle: topic.title,
      sessionLog: emptyCounts(),
      topicPause: emptyCounts(),
      confusion: emptyCounts(),
      mistake: emptyCounts(),
      mistakeConceptMatches: 0,
    };

    const run = async (tx: any) => {
      // ---- SessionLog ----
      for (const s of sessionLogsJson) {
        report.sessionLog.found++;
        if (!s || !s.id) { report.sessionLog.skipped++; continue; }
        const existing = await tx.sessionLog.findFirst({ where: { topicId: topic.id, legacyId: s.id } });
        const data = {
          userId: topic.userId,
          topicId: topic.id,
          activityType: s.activityType || 'free_explore',
          whatDone: s.whatDone || '',
          oneInsight: s.oneInsight || '',
          whatWasHard: s.whatWasHard || '',
          nextAction: s.nextAction || '',
          durationMinutes: Number(s.durationMinutes) || 0,
          moduleId: s.moduleId ?? null,
          timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
          legacyId: s.id,
        };
        if (DRY_RUN) { existing ? report.sessionLog.updated++ : report.sessionLog.created++; continue; }
        if (existing) { await tx.sessionLog.update({ where: { id: existing.id }, data }); report.sessionLog.updated++; }
        else { await tx.sessionLog.create({ data }); report.sessionLog.created++; }
      }

      // ---- TopicPause ----
      for (const p of pauseHistoryJson) {
        report.topicPause.found++;
        if (!p || !p.id) { report.topicPause.skipped++; continue; }
        const existing = await tx.topicPause.findFirst({ where: { topicId: topic.id, legacyId: p.id } });
        const data = {
          userId: topic.userId,
          topicId: topic.id,
          pausedAt: p.pausedAt ? new Date(p.pausedAt) : new Date(),
          resumedAt: p.resumedAt ? new Date(p.resumedAt) : null,
          reason: p.reason ?? null,
          completedConcepts: Array.isArray(p.completedConcepts) ? p.completedConcepts.map(String) : [],
          currentConcept: p.currentConcept ?? null,
          openQuestion: p.openQuestion ?? null,
          reactivationScore: p.reactivationScore != null ? String(p.reactivationScore) : null,
          legacyId: p.id,
        };
        if (DRY_RUN) { existing ? report.topicPause.updated++ : report.topicPause.created++; continue; }
        if (existing) { await tx.topicPause.update({ where: { id: existing.id }, data }); report.topicPause.updated++; }
        else { await tx.topicPause.create({ data }); report.topicPause.created++; }
      }

      // ---- Confusion ----
      for (const c of confusionsJson) {
        report.confusion.found++;
        if (!c || !c.id) { report.confusion.skipped++; continue; }
        const existing = await tx.confusion.findFirst({ where: { topicId: topic.id, legacyId: c.id } });
        const data = {
          userId: topic.userId,
          topicId: topic.id,
          text: c.text || '',
          resolved: !!c.resolved,
          resolvedAt: c.resolvedAt ? new Date(c.resolvedAt) : null,
          answer: c.answer ?? null,
          legacyId: c.id,
        };
        if (DRY_RUN) { existing ? report.confusion.updated++ : report.confusion.created++; continue; }
        if (existing) { await tx.confusion.update({ where: { id: existing.id }, data }); report.confusion.updated++; }
        else { await tx.confusion.create({ data }); report.confusion.created++; }
      }

      // ---- Mistake (with best-effort exact-title concept match) ----
      const topicConcepts = mistakesJson.length > 0
        ? await tx.concept.findMany({ where: { topicId: topic.id }, select: { id: true, title: true } })
        : [];
      const conceptByTitle = new Map<string, string[]>();
      for (const c of topicConcepts) {
        const arr = conceptByTitle.get(c.title) || [];
        arr.push(c.id);
        conceptByTitle.set(c.title, arr);
      }

      for (const m of mistakesJson) {
        report.mistake.found++;
        if (!m || !m.id) { report.mistake.skipped++; continue; }
        const existing = await tx.mistake.findFirst({ where: { topicId: topic.id, legacyId: m.id } });

        // Exact match only, and only if unambiguous (exactly one concept
        // has that title in this topic) — never fuzzy-match.
        const matches = conceptByTitle.get(m.concept || '') || [];
        const conceptId = matches.length === 1 ? matches[0] : null;
        if (conceptId) report.mistakeConceptMatches++;

        const data = {
          userId: topic.userId,
          topicId: topic.id,
          conceptId,
          conceptLabel: m.concept || 'General',
          mistake: m.mistake || '',
          whyMade: m.whyMade ?? null,
          correctUnderstanding: m.correctUnderstanding ?? null,
          example: m.example ?? null,
          howToAvoid: m.howToAvoid ?? null,
          occurredAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          legacyId: m.id,
        };
        if (DRY_RUN) { existing ? report.mistake.updated++ : report.mistake.created++; continue; }
        if (existing) { await tx.mistake.update({ where: { id: existing.id }, data }); report.mistake.updated++; }
        else { await tx.mistake.create({ data }); report.mistake.created++; }
      }
    };

    if (DRY_RUN) {
      await run(db);
    } else {
      await db.$transaction(async (tx) => run(tx));
    }

    reports.push(report);
  }

  console.log('--- Per-topic report ---');
  for (const r of reports) {
    console.log(`${r.topicTitle} (${r.topicId.slice(0, 8)}…):`);
    console.log(`    SessionLog:  found=${r.sessionLog.found} created=${r.sessionLog.created} updated=${r.sessionLog.updated} skipped=${r.sessionLog.skipped}`);
    console.log(`    TopicPause:  found=${r.topicPause.found} created=${r.topicPause.created} updated=${r.topicPause.updated} skipped=${r.topicPause.skipped}`);
    console.log(`    Confusion:   found=${r.confusion.found} created=${r.confusion.created} updated=${r.confusion.updated} skipped=${r.confusion.skipped}`);
    console.log(`    Mistake:     found=${r.mistake.found} created=${r.mistake.created} updated=${r.mistake.updated} skipped=${r.mistake.skipped} (${r.mistakeConceptMatches} matched to a concept)`);
  }

  const total = (key: keyof Omit<TopicReport, 'topicId' | 'topicTitle' | 'mistakeConceptMatches'>) =>
    reports.reduce((acc, r) => ({
      found: acc.found + r[key].found,
      created: acc.created + r[key].created,
      updated: acc.updated + r[key].updated,
      skipped: acc.skipped + r[key].skipped,
    }), emptyCounts());

  const totals = {
    sessionLog: total('sessionLog'),
    topicPause: total('topicPause'),
    confusion: total('confusion'),
    mistake: total('mistake'),
  };

  console.log('\n--- Totals ---');
  console.log(`topics with any extractable data: ${reports.length}`);
  for (const [key, c] of Object.entries(totals)) {
    console.log(`${key}: found=${c.found} created=${c.created} updated=${c.updated} skipped=${c.skipped}`);
  }

  const totalSkipped = Object.values(totals).reduce((s, c) => s + c.skipped, 0);
  if (totalSkipped > 0) {
    console.warn(`\n⚠️  ${totalSkipped} row(s) skipped — review the reports above before trusting the migration.`);
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
