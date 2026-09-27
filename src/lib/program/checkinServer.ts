import type { Prisma, PrismaClient } from '@prisma/client';
import { competencyFromModuleId, moduleIdFor, type CompetencyMap } from '@/data/competencies';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { consumeAiQuota } from '@/lib/rateLimit';
import { loadProgramView } from './load';
import { estimateHours } from './skeleton';
import {
  WEEK_MS, applyChanges, buildCheckinMessages, detectSignals, expectedPhase, fallbackProposal,
  parseProposal, resolveDecisions, describeChange,
  type Change, type Decision, type VersionState, type WeekSummary,
} from './checkin';
import type { Intake } from './types';

type Db = PrismaClient | Prisma.TransactionClient;

const dayStart = (t: number) => new Date(Math.floor(t / 86_400_000) * 86_400_000);

async function activeProgram(db: Db, userId: string, goalId: string) {
  return db.program.findFirst({
    where: { userId, goalId, status: 'active' },
    include: { items: { orderBy: [{ phase: 'asc' }, { order: 'asc' }] } },
  });
}

/** When the next check-in is due: a week after the last one, or after the plan started. */
export async function checkinDueAt(db: Db, userId: string, goalId: string): Promise<Date | null> {
  const first = await db.program.findFirst({ where: { userId, goalId, version: 1 }, select: { createdAt: true } });
  if (!first) return null;
  const last = await db.weeklyCheckin.findFirst({ where: { userId, goalId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
  return new Date((last?.createdAt ?? first.createdAt).getTime() + WEEK_MS);
}

/** The last seven days of evidence on the program's topics, summarised deterministically. */
export async function summarizeWeek(db: Db, userId: string, goalId: string, now = Date.now()): Promise<WeekSummary | null> {
  const program = await activeProgram(db, userId, goalId);
  if (!program) return null;
  const map = program.competencyMap as unknown as CompetencyMap;
  const title = (k: string) => map.competencies.find((c) => c.key === k)?.title ?? k;
  const topicIds = program.items.map((i) => i.topicId).filter((x): x is string => !!x);
  const start = new Date(now - WEEK_MS);
  const end = new Date(now);
  const inWindow = { gte: start, lt: end };

  const [time, modules, quizzes, problems, lapses, reps, view, first] = await Promise.all([
    db.studyTimeEntry.aggregate({ where: { userId, topicId: { in: topicIds }, startedAt: inWindow }, _sum: { seconds: true } }),
    db.curriculumItem.findMany({ where: { userId, topicId: { in: topicIds }, completed: true, completedAt: inWindow }, select: { legacyId: true } }),
    db.moduleAttempt.findMany({ where: { userId, topicId: { in: topicIds }, kind: 'quiz', createdAt: inWindow }, select: { moduleId: true, score: true } }),
    db.problemAttempt.findMany({ where: { userId, topicId: { in: topicIds }, attemptedAt: inWindow }, select: { moduleId: true, outcome: true } }),
    db.reviewLog.findMany({ where: { userId, grade: 'Again', reviewedAt: inWindow, concept: { topicId: { in: topicIds } } }, select: { concept: { select: { sourceModuleId: true } } } }),
    db.practiceRep.count({ where: { userId, topicId: { in: topicIds }, occurredAt: inWindow } }),
    loadProgramView(db, userId, goalId),
    db.program.findFirst({ where: { userId, goalId, version: 1 }, select: { createdAt: true } }),
  ]);

  const bestQuiz = new Map<string, number>();
  for (const q of quizzes) {
    const k = competencyFromModuleId(q.moduleId);
    if (k && q.score !== null) bestQuiz.set(k, Math.max(bestQuiz.get(k) ?? 0, q.score));
  }
  const lapseCount = new Map<string, number>();
  for (const l of lapses) {
    const k = competencyFromModuleId(l.concept.sourceModuleId);
    if (k) lapseCount.set(k, (lapseCount.get(k) ?? 0) + 1);
  }
  const phaseWeeks = Array.from(new Set(program.items.map((i) => i.phase))).sort((a, b) => a - b)
    .map((p) => program.items.find((i) => i.phase === p)!.weeks);
  const weeksElapsed = Math.floor((now - (first?.createdAt ?? program.createdAt).getTime()) / WEEK_MS);

  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    plannedMinutes: program.hoursPerWeek * 60,
    actualMinutes: Math.round((time._sum.seconds ?? 0) / 60),
    modulesCompleted: modules.map((m) => competencyFromModuleId(m.legacyId)).filter((k): k is string => !!k).map(title),
    quizzes: Array.from(bestQuiz.entries()).map(([key, score]) => ({ key, title: title(key), score })),
    problems: {
      cold: problems.filter((p) => p.outcome === 'cold').length,
      hint: problems.filter((p) => p.outcome === 'hint').length,
      stuck: problems.filter((p) => p.outcome === 'stuck').length,
      stuckKeys: Array.from(new Set(problems.filter((p) => p.outcome === 'stuck').map((p) => competencyFromModuleId(p.moduleId)).filter((k): k is string => !!k))),
    },
    lapses: Array.from(lapseCount.entries()).map(([key, count]) => ({ key, title: title(key), count })),
    practiceReps: reps,
    currentPhase: view?.checkpoints.find((c) => c.status !== 'ready')?.phase ?? null,
    expectedPhase: expectedPhase(phaseWeeks, weeksElapsed),
  };
}

export interface CheckinView {
  id: string;
  status: string;
  weekStart: Date;
  summary: WeekSummary;
  signals: Array<{ id: string; text: string }>;
  proposal: Array<Change & { label: string }>;
}

export function toView(row: { id: string; status: string; weekStart: Date; evidence: unknown; proposal: unknown }, map: CompetencyMap): CheckinView {
  const ev = row.evidence as { summary: WeekSummary; signals: CheckinView['signals'] };
  const title = (k: string) => map.competencies.find((c) => c.key === k)?.title ?? k;
  return {
    id: row.id, status: row.status, weekStart: row.weekStart, summary: ev.summary, signals: ev.signals,
    proposal: ((row.proposal as Change[] | null) ?? []).map((c) => ({ ...c, label: describeChange(c, title) })),
  };
}

/** Creates this week's check-in if one is due. On track → "no_change" without calling the AI. */
export async function createCheckin(db: Db, userId: string, goalId: string, now = Date.now()) {
  const dueAt = await checkinDueAt(db, userId, goalId);
  if (!dueAt) return { error: 'no_program' as const };
  if (now < dueAt.getTime()) return { error: 'not_due' as const, dueAt };
  const program = await activeProgram(db, userId, goalId);
  const summary = await summarizeWeek(db, userId, goalId, now);
  if (!program || !summary) return { error: 'no_program' as const };
  const map = program.competencyMap as unknown as CompetencyMap;
  const signals = detectSignals(summary);

  let proposal: Change[] = [];
  if (signals.length) {
    if (hasAnyAIProviderConfigured()) {
      try {
        await consumeAiQuota(userId);
        const keys = program.items.flatMap((i) => i.competencyKeys);
        const { content } = await callAIContent(
          buildCheckinMessages(summary, signals, { goal: (program.intake as unknown as Intake).goal, hoursPerWeek: program.hoursPerWeek, competencies: map.competencies.filter((c) => keys.includes(c.key)) }),
          { temperature: 0.2, jsonMode: true },
        );
        proposal = parseProposal(content, signals, keys);
        if (!proposal.length) console.warn('Check-in: AI proposal had no usable changes; using the fallback. Reply:', content.slice(0, 600));
      } catch (e) {
        console.warn('Check-in proposal via AI failed; using the fallback:', e instanceof Error ? e.message : e);
      }
    }
    if (!proposal.length) proposal = fallbackProposal(summary, signals);
  }

  const row = await db.weeklyCheckin.create({
    data: {
      userId, goalId, programVersion: program.version,
      weekStart: dayStart(new Date(summary.windowStart).getTime()),
      plannedMinutes: summary.plannedMinutes, actualMinutes: summary.actualMinutes,
      evidence: { summary, signals } as unknown as Prisma.InputJsonValue,
      proposal: proposal as unknown as Prisma.InputJsonValue,
      status: proposal.length ? 'proposed' : 'no_change',
      ...(proposal.length ? {} : { decidedAt: new Date(now) }),
    },
  });
  return { checkin: toView(row, map) };
}

/**
 * Applies the learner's decisions. Accepted changes produce program version
 * + 1 in one transaction: same items and topics, new hours/emphasis/focus,
 * checkpoints carried over, module estimates updated, and a ProgramChange
 * recording why. Declining everything creates no new version.
 */
export async function decideCheckin(db: PrismaClient, userId: string, goalId: string, checkinId: string, decisions: Decision[]) {
  const checkin = await db.weeklyCheckin.findFirst({ where: { id: checkinId, userId, goalId } });
  if (!checkin) return { error: 'not_found' as const };
  if (checkin.status !== 'proposed') return { error: 'already_decided' as const };
  const program = await db.program.findFirst({ where: { userId, goalId, status: 'active' }, include: { items: { orderBy: [{ phase: 'asc' }, { order: 'asc' }] }, checkpoints: true } });
  if (!program) return { error: 'not_found' as const };

  const proposal = (checkin.proposal as unknown as Change[]) ?? [];
  const accepted = resolveDecisions(proposal, decisions);
  const map = program.competencyMap as unknown as CompetencyMap;
  const adj = (program.adjustments as { emphasis?: Record<string, number>; focus?: Record<string, string> } | null) ?? {};

  if (!accepted.length) {
    await db.weeklyCheckin.update({ where: { id: checkin.id }, data: { status: 'decided', decisions: decisions as unknown as Prisma.InputJsonValue, decidedAt: new Date() } });
    return { version: program.version, created: false };
  }

  const state: VersionState = {
    intake: program.intake as unknown as Intake,
    map,
    emphasis: adj.emphasis ?? {},
    focus: adj.focus ?? {},
    items: program.items.map((i) => ({
      id: i.id, phase: i.phase, shape: i.shape, competencyKeys: i.competencyKeys, hoursPerWeek: i.hoursPerWeek, weeks: i.weeks,
      focus: (i.details as { focus?: string | null } | null)?.focus ?? null,
    })),
  };
  const next = applyChanges(state, accepted);
  const evidence = (checkin.evidence as { signals?: Array<{ id: string }> }).signals ?? [];
  const evidenceIds = Array.from(new Set(accepted.flatMap((c) => c.evidence))).filter((id) => evidence.some((s) => s.id === id));

  const version = await db.$transaction(async (tx) => {
    await tx.program.update({ where: { id: program.id }, data: { status: 'superseded' } });
    const created = await tx.program.create({
      data: {
        userId, goalId, version: program.version + 1, field: program.field, mapQuality: program.mapQuality,
        intake: next.intake as unknown as Prisma.InputJsonValue,
        competencyMap: program.competencyMap as Prisma.InputJsonValue,
        whyThisPlan: program.whyThisPlan,
        hoursPerWeek: next.intake.hoursPerWeek,
        totalWeeks: next.totalWeeks,
        adjustments: { emphasis: next.emphasis, focus: next.focus } as Prisma.InputJsonValue,
      },
    });
    for (let i = 0; i < program.items.length; i++) {
      const old = program.items[i];
      const n = next.items[i];
      await tx.programItem.create({
        data: {
          userId, programId: created.id, phase: old.phase, phaseTitle: old.phaseTitle, order: old.order, shape: old.shape,
          title: old.title, competencyKeys: old.competencyKeys, hoursPerWeek: n.hoursPerWeek, weeks: n.weeks,
          resourceKeys: old.resourceKeys,
          details: { ...((old.details as object | null) ?? {}), focus: n.focus } as Prisma.InputJsonValue,
          topicId: old.topicId,
        },
      });
    }
    for (const cp of program.checkpoints) {
      await tx.checkpoint.create({ data: { userId, programId: created.id, phase: cp.phase, title: cp.title, competencyKeys: cp.competencyKeys, status: cp.status, metAt: cp.metAt } });
    }
    // Module time estimates follow the new emphasis and hours.
    for (const c of map.competencies.filter((x) => program.items.some((i) => i.competencyKeys.includes(x.key)))) {
      await tx.curriculumItem.updateMany({
        where: { userId, legacyId: moduleIdFor(c.key), topicId: { in: program.items.map((i) => i.topicId).filter((x): x is string => !!x) } },
        data: { estimatedMinutes: Math.round(estimateHours(c, next.intake, next.emphasis[c.key] ?? 1) * 60) },
      });
    }
    await tx.programChange.create({
      data: {
        userId, goalId, fromVersion: program.version, toVersion: created.version,
        reason: accepted.map((c) => c.reason).join(' '),
        evidenceIds: [checkin.id, ...evidenceIds],
        changes: accepted.map((c) => ({ ...c, label: describeChange(c, (k) => map.competencies.find((x) => x.key === k)?.title ?? k) })) as unknown as Prisma.InputJsonValue,
        approvedBy: userId,
      },
    });
    await tx.weeklyCheckin.update({ where: { id: checkin.id }, data: { status: 'decided', decisions: decisions as unknown as Prisma.InputJsonValue, decidedAt: new Date() } });
    return created.version;
  }, { timeout: 60_000 });

  return { version, created: true };
}
