import type { Prisma, PrismaClient } from '@prisma/client';
import type { CompetencyMap } from '@/data/competencies';
import { evaluateMatrix, checkpointStatus, type MatrixRow } from './evidence';
import type { Intake } from './types';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Loads a goal's active program with live evidence: evaluates the matrix
 * from the evidence tables, writes it through to CompetencyEvidence and the
 * checkpoints (metAt is set the first time a checkpoint turns ready), and
 * returns everything the goal page shows. Null when the goal has no program.
 */
export async function loadProgramView(db: Db, userId: string, goalId: string) {
  const program = await db.program.findFirst({
    where: { userId, goalId, status: 'active' },
    include: {
      items: { orderBy: [{ phase: 'asc' }, { order: 'asc' }], include: { topic: { select: { id: true, title: true, status: true, progressPct: true, deletedAt: true, mode: true } } } },
      checkpoints: { orderBy: { phase: 'asc' } },
    },
  });
  if (!program) return null;

  const map = program.competencyMap as unknown as CompetencyMap;
  const intake = program.intake as unknown as Intake;
  const topicIds = program.items.map((i) => i.topicId).filter((x): x is string => !!x);

  const [attempts, problems, cards, artifacts, reps, changes] = await Promise.all([
    db.moduleAttempt.findMany({ where: { userId, topicId: { in: topicIds } }, select: { topicId: true, moduleId: true, kind: true, score: true, verdict: true } }),
    db.problemAttempt.findMany({ where: { userId, topicId: { in: topicIds } }, select: { topicId: true, moduleId: true, outcome: true } }),
    db.concept.findMany({ where: { userId, topicId: { in: topicIds }, suspended: false }, select: { topicId: true, sourceModuleId: true, state: true, reps: true } }),
    db.artifact.findMany({ where: { userId, topicId: { in: topicIds } }, select: { topicId: true } }),
    db.practiceRep.findMany({ where: { userId, topicId: { in: topicIds } }, select: { topicId: true } }),
    db.programChange.findMany({ where: { userId, goalId }, orderBy: { toVersion: 'asc' } }),
  ]);

  const inScope = new Set(program.items.flatMap((i) => i.competencyKeys));
  const competencies = map.competencies.filter((c) => inScope.has(c.key));
  const items = program.items.map((i) => ({
    shape: i.shape,
    topicId: i.topic && !i.topic.deletedAt ? i.topicId : null,
    competencyKeys: i.competencyKeys,
  }));
  const matrix: MatrixRow[] = evaluateMatrix(competencies, intake.target, items, {
    attempts, problems, cards: cards.map((c) => ({ ...c, state: String(c.state) })), artifacts, reps,
  });

  // Write-through cache, so other screens (and the weekly check-in) can read it cheaply.
  const now = new Date();
  for (const r of matrix) {
    await db.competencyEvidence.upsert({
      where: { programId_competencyKey: { programId: program.id, competencyKey: r.key } },
      create: { userId, programId: program.id, competencyKey: r.key, required: r.required as unknown as Prisma.InputJsonValue, actual: r.actual as unknown as Prisma.InputJsonValue, status: r.status },
      update: { required: r.required as unknown as Prisma.InputJsonValue, actual: r.actual as unknown as Prisma.InputJsonValue, status: r.status, evaluatedAt: now },
    });
  }
  const checkpoints = [];
  for (const cp of program.checkpoints) {
    const status = checkpointStatus(cp.competencyKeys, matrix);
    const metAt = status === 'ready' ? cp.metAt ?? now : null;
    if (status !== cp.status || String(metAt) !== String(cp.metAt)) {
      await db.checkpoint.update({ where: { id: cp.id }, data: { status, metAt } });
    }
    checkpoints.push({ id: cp.id, phase: cp.phase, title: cp.title, competencyKeys: cp.competencyKeys, status, metAt });
  }

  return {
    program: {
      id: program.id, version: program.version, field: program.field, mapQuality: program.mapQuality,
      whyThisPlan: program.whyThisPlan, hoursPerWeek: program.hoursPerWeek, totalWeeks: program.totalWeeks,
      createdAt: program.createdAt, intake, mapTitle: map.title,
    },
    items: program.items.map((i) => ({
      id: i.id, phase: i.phase, phaseTitle: i.phaseTitle, shape: i.shape, title: i.title,
      competencyKeys: i.competencyKeys, hoursPerWeek: i.hoursPerWeek, weeks: i.weeks,
      focus: (i.details as { focus?: string | null } | null)?.focus ?? null,
      topic: i.topic && !i.topic.deletedAt ? { id: i.topic.id, title: i.topic.title, status: i.topic.status, progressPct: i.topic.progressPct } : null,
    })),
    checkpoints,
    matrix,
    history: changes.map((c) => ({ version: c.toVersion, fromVersion: c.fromVersion, reason: c.reason, createdAt: c.createdAt, changes: c.changes })),
  };
}

export type ProgramView = NonNullable<Awaited<ReturnType<typeof loadProgramView>>>;
