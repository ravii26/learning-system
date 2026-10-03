import type { Prisma, PrismaClient } from '@prisma/client';
import { DEPTH_FOR_TARGET, lessonsOf, moduleIdFor, type Competency } from '@/data/competencies';
import { ensureAreaSkillId } from '@/lib/areaSkill';
import { estimateHours } from './skeleton';
import { targetLabel } from './why';
import type { Adjustments } from './adapt';
import type { DraftItem, Intake, ProgramDraft, Shape } from './types';

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Turns an approved draft into real app objects in one transaction: a Goal,
 * Program v1, one topic per item (modules named c:<competency> so evidence
 * maps back), ProgramItems, Checkpoints, GoalLinks and the first
 * ProgramChange. Existing screens (Learn, topic page, Review, Practice) then
 * work on these topics unchanged.
 */

const MODE: Record<Shape, string> = { course: 'syllabus', reading: 'syllabus', project: 'syllabus', exploration: 'accretion', practice: 'practice' };
const LEVEL_WORD = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

export function rubricFor(item: DraftItem, draft: ProgramDraft): string {
  const text = `${draft.map.title} ${item.title}`.toLowerCase();
  if (/writ/.test(text)) return 'writing';
  if (/english|speak|conversation|pronunciation|accent/.test(text)) return 'spoken_english';
  if (draft.mapQuality === 'curated') return 'technical_explanation';
  return 'impromptu';
}

/**
 * Status for a new topic: phase 1 takes free Now slots (the 2-active limit
 * still holds), practice runs alongside without a slot, phase 2 waits in
 * Next and later phases in the Inbox until their turn.
 */
export function initialStatus(item: DraftItem, slotsFree: number): 'active' | 'queued' | 'inbox' | 'maintenance' {
  if (item.phase === 1 && item.shape === 'practice') return 'maintenance';
  if (item.phase === 1) return slotsFree > 0 ? 'active' : 'queued';
  return item.phase === 2 ? 'queued' : 'inbox';
}

/**
 * The goal's type (area) from what it is about. Keywords win over the
 * archetype (a music exam is Creative, not "exam"); unknown stays Other.
 * The learner can change it on the goal page, which re-types every topic.
 */
export function areaForPlan(text: string, archetype: string | undefined, curated: boolean): string {
  const t = text.toLowerCase();
  if (/financ|invest|money|stock|trading|accounting|tax|budget|crypto|wealth/.test(t)) return 'Finance';
  if (/business|marketing|sales|management|startup|entrepreneur|leadership|product manag/.test(t)) return 'Business';
  if (/design|drawing|paint|music|guitar|piano|\bsing(ing|er)?\b|photograph|film|illustrat|creative writing/.test(t)) return 'Creative';
  if (curated || archetype === 'technical' || /programm|coding|software|developer|data|machine learning|ai|ml|cloud|devops|security|web|algorithm/.test(t)) return 'Tech';
  if (archetype === 'professional') return 'Business';
  if (archetype === 'creative') return 'Creative';
  if (archetype === 'language' || archetype === 'performance') return 'Personal';
  return 'Other';
}

export interface PersistInput {
  userId: string;
  draft: ProgramDraft;
  adjustments: Adjustments;
}

export async function persistProgram(tx: Tx, { userId, draft, adjustments }: PersistInput): Promise<{ goalId: string; programId: string }> {
  const intake: Intake = draft.intake;
  const area = areaForPlan(`${draft.map.title} ${intake.goal}`, intake.archetype ?? draft.map.archetype, draft.mapQuality === 'curated');
  const skillId = await ensureAreaSkillId(tx, userId, area);
  const comp = (k: string) => draft.map.competencies.find((c) => c.key === k)!;

  const goal = await tx.goal.create({
    data: {
      userId,
      title: `${draft.map.title}: ${targetLabel(intake.target, intake.archetype ?? draft.map.archetype)}`,
      outcome: intake.doneMeans || intake.goal,
      why: intake.why ?? null,
      area,
      status: 'active',
      startedAt: new Date(),
      targetDate: intake.deadlineWeeks ? new Date(Date.now() + intake.deadlineWeeks * 7 * 86_400_000) : null,
    },
  });

  const program = await tx.program.create({
    data: {
      userId,
      goalId: goal.id,
      version: 1,
      field: draft.field,
      mapQuality: draft.mapQuality,
      intake: intake as unknown as Prisma.InputJsonValue,
      competencyMap: draft.map as unknown as Prisma.InputJsonValue,
      whyThisPlan: draft.whyThisPlan,
      hoursPerWeek: draft.hoursPerWeek,
      totalWeeks: draft.totalWeeks,
      adjustments: { emphasis: adjustments.emphasis, focus: {} } as Prisma.InputJsonValue,
    },
  });

  const active = await tx.topic.findMany({ where: { userId, status: 'active', deletedAt: null }, select: { activeSlotType: true } });
  let slotsFree = Math.max(0, 2 - active.length);
  let primaryTaken = active.some((t) => t.activeSlotType === 'primary');

  let linkOrder = 0;
  for (const phase of draft.phases) {
    for (let order = 0; order < phase.items.length; order++) {
      const item = phase.items[order];
      const comps: Competency[] = item.competencyKeys.map(comp);
      // One module per lesson, so a 7-hour topic is taught in several sittings, not squeezed into one.
      const modules = comps.flatMap((c) => {
        const lessons = lessonsOf(c);
        const minutes = Math.round((estimateHours(c, intake, adjustments.emphasis[c.key] ?? 1) * 60) / lessons.length);
        return lessons.map((title, j) => ({ id: moduleIdFor(c.key, j + 1), title, estimatedMinutes: minutes }));
      }).map((m, i) => ({ ...m, order: i + 1, completed: false, completedAt: null, notes: '' }));
      const resources = item.resources.map((r) => ({
        title: r.title, type: r.type, url: r.url, purpose: r.role, status: 'NOT_STARTED', notes: '',
      }));

      const status = initialStatus(item, slotsFree);
      let slotType: 'primary' | 'secondary' | null = null;
      if (status === 'active') {
        slotsFree--;
        slotType = primaryTaken ? 'secondary' : 'primary';
        primaryTaken = true;
      }
      const firstModule = modules[0]?.title;
      const topic = await tx.topic.create({
        data: {
          userId,
          title: item.title.slice(0, 160),
          area,
          skillId,
          why: intake.why || `Part of your plan: ${intake.goal}`,
          depthTarget: DEPTH_FOR_TARGET[intake.target],
          status,
          activeSlotType: slotType,
          startedDate: status === 'active' ? new Date() : null,
          progressPct: 0,
          currentStage: 'Define',
          nextAction: item.shape === 'practice' ? 'Do today’s rep' : firstModule ? `Study: ${firstModule}` : 'Start the first step',
          mode: MODE[item.shape],
          rubricTemplate: item.shape === 'practice' ? rubricFor(item, draft) : null,
          topicMode: 'course',
          curriculum: (item.shape === 'practice' || item.shape === 'exploration' ? [] : modules) as unknown as Prisma.InputJsonValue,
          resources: resources as unknown as Prisma.InputJsonValue,
          subtasks: [],
          knowledgeMap: { concepts: [] },
          confusions: [],
          mistakes: [],
          pauseHistory: [],
          contract: {
            outcome: intake.doneMeans || intake.goal,
            estimatedEffort: Math.round(item.hoursPerWeek * item.weeks),
            successCriterion: `Phase ${item.phase} checkpoint`,
            currentLevel: LEVEL_WORD[intake.currentLevel],
            prerequisites: [],
          },
        },
      });
      if (item.shape !== 'practice' && item.shape !== 'exploration' && modules.length > 0) {
        await tx.curriculumItem.createMany({
          data: modules.map((m) => ({
            userId,
            topicId: topic.id,
            legacyId: m.id,
            order: m.order,
            title: m.title,
            estimatedMinutes: m.estimatedMinutes,
            completed: false,
            completedAt: null,
            notes: '',
            removed: false,
          })),
        });
      }

      if (item.resources.length > 0) {
        await tx.resource.createMany({
          data: item.resources.map((r, i) => ({
            userId,
            topicId: topic.id,
            legacyId: r.catalogKey || `res-${i + 1}`,
            order: i + 1,
            title: r.title,
            type: r.type,
            url: r.url,
            purpose: r.role,
            status: 'NOT_STARTED',
            source: r.source,
            catalogKey: r.catalogKey,
            quality: r.quality,
            pricing: r.pricing,
            role: r.role,
            linkStatus: r.source === 'ai' ? 'unchecked' : 'ok',
            linkCheckedAt: r.source === 'search' ? new Date() : null,
            notes: '',
          })),
        });
      }
      await tx.activityLog.create({ data: { userId, topicId: topic.id, fieldChanged: 'status', oldValue: null, newValue: status } });

      await tx.programItem.create({
        data: {
          userId,
          programId: program.id,
          phase: item.phase,
          phaseTitle: phase.title,
          order,
          shape: item.shape,
          title: item.title,
          competencyKeys: item.competencyKeys,
          hoursPerWeek: item.hoursPerWeek,
          weeks: item.weeks,
          resourceKeys: item.resources.map((r) => r.catalogKey).filter((k): k is string => !!k),
          details: { focus: item.focus ?? null, resources: item.resources } as unknown as Prisma.InputJsonValue,
          topicId: topic.id,
        },
      });
      await tx.goalLink.create({
        data: {
          userId, goalId: goal.id, topicId: topic.id, order: linkOrder++,
          required: comps.some((c) => c.importance === 'core'), weight: 1,
        },
      });
    }
    await tx.checkpoint.create({
      data: { userId, programId: program.id, phase: phase.phase, title: phase.checkpoint.title, competencyKeys: phase.checkpoint.competencyKeys },
    });
  }

  await tx.programChange.create({
    data: {
      userId, goalId: goal.id, fromVersion: null, toVersion: 1,
      reason: 'Program created from your intake',
      changes: { created: true, phases: draft.phases.length, totalWeeks: draft.totalWeeks } as Prisma.InputJsonValue,
      approvedBy: userId,
    },
  });

  return { goalId: goal.id, programId: program.id };
}
