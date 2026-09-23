import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { validateTopicPayload } from '@/lib/validations/topic';

export async function GET(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const area = searchParams.get('area');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Build filters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId };
    if (area) {
      where.area = area;
    }
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const topics = await db.topic.findMany({
      where,
      orderBy: { lastTouchedDate: 'desc' },
    });

    return NextResponse.json(topics);
  } catch (e) {
    console.error('Failed to fetch topics:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const rawBody = await request.json();
    const validation = validateTopicPayload(rawBody, true);
    if (!validation.isValid || !validation.payload) {
      return NextResponse.json({ error: validation.error || 'Invalid payload' }, { status: 400 });
    }
    const body = validation.payload;
    const { 
      title, 
      area, 
      why, 
      depthTarget, 
      status = 'inbox',
      currentStage = 'Define',
      nextAction, 
      proofOfLearning, 
      resources, 
      subtasks, 
      notes,
      contract,
      knowledgeMap,
      confusions,
      mistakes,
      pauseHistory,
      activeSlotType,
      // Previously missing from this destructure entirely — every topic
      // created here (including every one from the AI roadmap wizard, the
      // only real caller that sends them) silently lost its topicMode and
      // curriculum modules on creation, with no error to signal it.
      topicMode,
      curriculum,
      mode,
      skillId,
    } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const finalArea = area || 'Other';
    let finalActiveSlotType = activeSlotType || null;

    // Enforce limits and field guards if starting directly as active
    if (status === 'active') {
      // 1. Verify Active Limit (max 2 active topics)
      const activeTopics = await db.topic.findMany({
        where: { status: 'active', userId },
      });
      if (activeTopics.length >= 2) {
        return NextResponse.json(
          { error: 'Active limit reached. You already have 2 active topics. Please pause or drop one first.' },
          { status: 400 }
        );
      }

      // Automatically determine slot type if not provided
      if (!finalActiveSlotType) {
        const hasPrimary = activeTopics.some(t => t.activeSlotType === 'primary');
        finalActiveSlotType = hasPrimary ? 'secondary' : 'primary';
      }

      // 2. Verify required fields for active status
      if (!why || !depthTarget || !nextAction) {
        return NextResponse.json(
          { error: 'To make a topic Active, you must provide "Why you are learning", "Depth Target", and a "Next Action".' },
          { status: 400 }
        );
      }
    }

    // Enforce next action rule for paused status
    if (status === 'paused' && !nextAction) {
      return NextResponse.json(
        { error: 'A Next Action is required to pause a topic.' },
        { status: 400 }
      );
    }

    // Create the Topic card
    const topic = await db.topic.create({
      data: {
        userId,
        title,
        area: finalArea,
        why,
        depthTarget,
        status,
        // Always 0 on creation, regardless of what the client sends — a
        // brand-new topic has no subtasks/curriculum/concepts yet, so 0 is
        // always correct, and progressPct is server-derived from here on
        // (see the PUT route's recompute-on-every-write logic).
        progressPct: 0,
        currentStage,
        nextAction,
        proofOfLearning,
        resources: resources || [],
        subtasks: subtasks || [],
        notes,
        startedDate: status === 'active' ? new Date() : null,
        contract: contract || { outcome: '', estimatedEffort: 0, successCriterion: '', currentLevel: 'Beginner', prerequisites: [] },
        knowledgeMap: knowledgeMap || { concepts: [] },
        confusions: confusions || [],
        mistakes: mistakes || [],
        pauseHistory: pauseHistory || [],
        activeSlotType: finalActiveSlotType,
        topicMode: topicMode || null,
        curriculum: curriculum || [],
        mode: mode || 'syllabus',
        skillId: skillId || null,
      },
    });

    // Create Activity Log entry for creation
    await db.activityLog.create({
      data: {
        userId,
        topicId: topic.id,
        fieldChanged: 'status',
        oldValue: null,
        newValue: status,
      },
    });

    if (nextAction) {
      await db.activityLog.create({
        data: {
          userId,
          topicId: topic.id,
          fieldChanged: 'nextAction',
          oldValue: null,
          newValue: nextAction,
        },
      });
    }

    return NextResponse.json(topic);
  } catch (e) {
    console.error('Failed to create topic:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
