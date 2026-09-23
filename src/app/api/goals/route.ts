import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { slugifySkillName } from '@/lib/skillSlug';
import { recomputeGoalReadiness } from '@/lib/goalReadinessRecompute';

/**
 * Every goal and its readiness, newest first. List, not detail — full
 * linked-topic data lives at GET /api/goals/[id].
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const goals = await db.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { links: true } } },
    });
    return NextResponse.json(goals);
  } catch (e) {
    console.error('Failed to list goals:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

interface CreateGoalTopic {
  title: string;
  area?: string;
  why?: string;
  depthTarget?: string;
  estimatedHours?: number;
  nextAction?: string;
  mode?: 'self_directed' | 'course';
  curriculum?: string[];
}

/**
 * Creates a Goal, persists the raw roadmap response for provenance, and
 * creates every generated topic + a GoalLink for each — atomically, in one
 * transaction. Replaces RoadmapWizard.tsx's previous behavior: looping
 * individual POST /api/topics calls and discarding roadmapTitle/
 * estimatedWeeks/the original prompt the moment topics existed. That data
 * is exactly what a Goal is for (see the project plan) — this endpoint is
 * the "missing row for data the app already generates," not new AI work.
 *
 * The first topic in the array starts 'active' only if a slot is free;
 * otherwise every topic starts 'queued' rather than erroring the whole
 * roadmap out over the WIP limit — a bulk-create shouldn't fail a batch of
 * 6 good topics because slot 2/2 was already taken.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    const { title, outcome, why, targetDate, roadmapRaw, currentLevel, topics } = body as {
      title?: string;
      outcome?: string;
      why?: string | null;
      targetDate?: string | null;
      roadmapRaw?: unknown;
      currentLevel?: string;
      topics?: CreateGoalTopic[];
    };
    const contractLevel = currentLevel === 'beginner' ? 'Beginner' : 'Intermediate';

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!outcome || !outcome.trim()) {
      return NextResponse.json({ error: 'outcome is required' }, { status: 400 });
    }
    if (!Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json({ error: 'At least one topic is required' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const goal = await tx.goal.create({
        data: {
          userId,
          title: title.trim(),
          outcome: outcome.trim(),
          why: why?.trim() || null,
          status: 'active',
          targetDate: targetDate ? new Date(targetDate) : null,
          startedAt: new Date(),
          roadmapRaw: roadmapRaw !== undefined ? (roadmapRaw as object) : undefined,
        },
      });

      const existingActive = await tx.topic.findMany({
        where: { userId, status: 'active' },
        select: { activeSlotType: true },
      });
      let activeSlotsUsed = existingActive.length;
      let primaryTaken = existingActive.some((t) => t.activeSlotType === 'primary');

      // Skill roots are looked up, not created, if missing — a goal
      // shouldn't silently invent new areas the Phase 6 backfill didn't
      // seed. Falls back to no skill link rather than guessing.
      const skillCache = new Map<string, string | null>();
      const resolveSkillId = async (area: string): Promise<string | null> => {
        const slug = slugifySkillName(area || 'other');
        if (skillCache.has(slug)) return skillCache.get(slug)!;
        const skill = await tx.skill.findFirst({ where: { userId, slug }, select: { id: true } });
        skillCache.set(slug, skill?.id ?? null);
        return skill?.id ?? null;
      };

      for (let i = 0; i < topics.length; i++) {
        const t = topics[i];
        if (!t.title || !t.title.trim()) continue;

        const area = t.area || 'Other';
        const skillId = await resolveSkillId(area);

        const canGoActive = activeSlotsUsed < 2;
        const status = canGoActive ? 'active' : 'queued';
        let slotType: 'primary' | 'secondary' | null = null;
        if (canGoActive) {
          activeSlotsUsed++;
          slotType = primaryTaken ? 'secondary' : 'primary';
          primaryTaken = true;
        }

        const curriculumModules = (t.curriculum || []).map((modTitle, idx) => ({
          id: Math.random().toString(36).substring(2, 9),
          order: idx + 1,
          title: modTitle,
          estimatedMinutes: 45,
          completed: false,
          completedAt: null,
          notes: '',
        }));

        const topicWhy = t.why || `Part of ${title.trim()}`;
        const topicNextAction = t.nextAction || 'Review the module list and start module 1';
        const topicDepth = t.depthTarget || 'Proficiency';

        const topic = await tx.topic.create({
          data: {
            userId,
            title: t.title.trim(),
            area,
            skillId,
            why: topicWhy,
            depthTarget: topicDepth,
            status,
            progressPct: 0,
            currentStage: 'Define',
            nextAction: topicNextAction,
            resources: [],
            subtasks: [],
            contract: {
              outcome: topicWhy,
              estimatedEffort: t.estimatedHours || 10,
              successCriterion: 'Complete foundational concepts and practical exercises',
              currentLevel: contractLevel,
              prerequisites: [],
            },
            knowledgeMap: { concepts: [] },
            confusions: [],
            mistakes: [],
            pauseHistory: [],
            activeSlotType: slotType,
            topicMode: t.mode || 'self_directed',
            curriculum: curriculumModules,
            startedDate: status === 'active' ? new Date() : null,
          },
        });

        await tx.activityLog.create({
          data: { userId, topicId: topic.id, fieldChanged: 'status', oldValue: null, newValue: status },
        });

        await tx.goalLink.create({
          data: { userId, goalId: goal.id, topicId: topic.id, order: i, required: true, weight: 1 },
        });
      }

      return goal.id;
    });

    const readiness = await recomputeGoalReadiness(db, userId, result);

    const withLinks = await db.goal.findUnique({
      where: { id: result },
      include: { links: { include: { topic: true }, orderBy: { order: 'asc' } } },
    });

    return NextResponse.json({ ...withLinks, readiness });
  } catch (e) {
    console.error('Failed to create goal:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
