import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

// Enforce authentication for all topic database modifications
function checkAuth() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const { searchParams } = new URL(request.url);
    const area = searchParams.get('area');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Build filters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
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
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { 
      title, 
      area, 
      why, 
      depthTarget, 
      status = 'inbox', 
      progressPct = 0, 
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
      activeSlotType
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
        where: { status: 'active' },
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
        title,
        area: finalArea,
        why,
        depthTarget,
        status,
        progressPct,
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
      },
    });

    // Create Activity Log entry for creation
    await db.activityLog.create({
      data: {
        topicId: topic.id,
        fieldChanged: 'status',
        oldValue: null,
        newValue: status,
      },
    });

    if (nextAction) {
      await db.activityLog.create({
        data: {
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
