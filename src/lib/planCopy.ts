import type { Prisma, PrismaClient } from '@prisma/client';
import type { CurriculumJson } from './curriculumSync';
import type { ResourceJson } from './resourceSync';
import { syncTopicListsAndMirror } from './topicListSync';
import { ensureAreaSkillId } from './areaSkill';

type Tx = PrismaClient | Prisma.TransactionClient;

/**
 * Copying a friend's plan: you get their structure (modules, in order, and
 * resources) with none of their progress or private writing. Module ids
 * are kept on purpose, so your copy and theirs can be compared module by
 * module later. Module notes and resource notes stay behind: those are
 * the friend's own writing, not the plan.
 */

export interface SourceModule { legacyId: string; order: number; title: string; estimatedMinutes: number }
export interface SourceResource { title: string; type: string; url: string; purpose: string }

export function copiedCurriculum(modules: SourceModule[]): CurriculumJson[] {
  return [...modules]
    .sort((a, b) => a.order - b.order)
    .map((m, i) => ({
      id: m.legacyId,
      order: i + 1,
      title: m.title,
      estimatedMinutes: m.estimatedMinutes,
      completed: false,
      completedAt: null,
      notes: '',
    }));
}

export function copiedResources(resources: SourceResource[]): ResourceJson[] {
  return resources.map((r) => ({
    title: r.title,
    type: r.type,
    url: r.url,
    purpose: r.purpose,
    status: 'NOT_STARTED',
    notes: '',
  }));
}

export interface SourceTopic {
  id: string;
  title: string;
  area: string;
  mode: string;
  topicMode: string | null;
  depthTarget: string | null;
  rubricTemplate: string | null;
  modules: SourceModule[];
  resources: SourceResource[];
}

/**
 * Creates your copy in Next (queued), never Now: copying shouldn't take one
 * of your two active slots or skip the "why am I learning this" step.
 * Returns your existing copy instead if you already have one.
 */
export async function copyTopicPlan(tx: Tx, userId: string, source: SourceTopic): Promise<{ id: string; created: boolean }> {
  const existing = await tx.topic.findFirst({
    where: { userId, copiedFromId: source.id, deletedAt: null },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const curriculum = copiedCurriculum(source.modules);
  const resources = copiedResources(source.resources);
  const created = await tx.topic.create({
    data: {
      userId,
      title: source.title,
      area: source.area,
      status: 'queued',
      currentStage: 'Define',
      progressPct: 0,
      depthTarget: source.depthTarget,
      mode: source.mode,
      topicMode: source.topicMode,
      rubricTemplate: source.rubricTemplate,
      curriculum: curriculum as unknown as Prisma.InputJsonValue,
      resources: resources as unknown as Prisma.InputJsonValue,
      subtasks: [],
      knowledgeMap: { concepts: [] },
      confusions: [],
      mistakes: [],
      pauseHistory: [],
      contract: { outcome: '', estimatedEffort: 0, successCriterion: '', currentLevel: 'Beginner', prerequisites: [] },
      skillId: await ensureAreaSkillId(tx, userId, source.area),
      copiedFromId: source.id,
    },
  });
  await syncTopicListsAndMirror(tx, userId, created.id, { curriculum, resources });
  return { id: created.id, created: true };
}
