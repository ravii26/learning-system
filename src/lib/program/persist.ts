import type { Prisma, PrismaClient } from '@prisma/client';
import { DEPTH_FOR_TARGET, moduleIdFor, type Competency } from '@/data/competencies';
import { ensureAreaSkillId } from '@/lib/areaSkill';
import { syncTopicListsAndMirror } from '@/lib/topicListSync';
import { estimateHours } from './skeleton';
import { TARGET_LABEL } from './why';
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

export interface PersistInput {
  userId: string;
  draft: ProgramDraft;
  adjustments: Adjustments;
}

export async function persistProgram(tx: Tx, { userId, draft, adjustments }: PersistInput): Promise<{ goalId: string; programId: string }> {
  const intake: Intake = draft.intake;
  const area = draft.mapQuality === 'curated' ? 'Tech' : 'Other';
  const skillId = await ensureAreaSkillId(tx, userId, area);
  const comp = (k: string) => draft.map.competencies.find((c) => c.key === k)!;

  const goal = await tx.goal.create({
    data: {
      userId,
      title: `${draft.map.title}: ${TARGET_LABEL[intake.target]}`,
      outcome: intake.doneMeans || intake.goal,
      why: intake.why ?? null,
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
      const modules = comps.map((c, i) => ({
        id: moduleIdFor(c.key),
        order: i + 1,
        title: c.title,
        estimatedMinutes: Math.round(estimateHours(c, intake, adjustments.emphasis[c.key] ?? 1) * 60),
        completed: false,
        completedAt: null,
        notes: '',
      }));
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
      await syncTopicListsAndMirror(tx, userId, topic.id, {
        curriculum: item.shape === 'practice' || item.shape === 'exploration' ? [] : modules,
        resources,
      });
      // resourceSync only knows the legacy fields; stamp the trust fields per URL.
      for (const r of item.resources) {
        await tx.resource.updateMany({
          where: { topicId: topic.id, url: r.url },
          data: { source: r.source, catalogKey: r.catalogKey, quality: r.quality, pricing: r.pricing, role: r.role, linkStatus: r.source === 'catalog' ? 'ok' : 'unchecked' },
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
