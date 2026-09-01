import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAuthenticated } from '@/lib/auth';

function checkAuth() {
  if (!isAuthenticated()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// Enforce SOW state transitions
function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (to === 'dropped') return true; // Dropping is allowed from anywhere
  // Allow direct promotion to active (prioritization swap bypass)
  if (to === 'active') return true;

  switch (from) {
    case 'inbox':
      return to === 'queued';
    case 'queued':
      return to === 'active';
    case 'active':
      return to === 'paused' || to === 'maintenance';
    case 'paused':
      return to === 'active';
    case 'maintenance':
      return to === 'active';
    default:
      // Allow moving exploration items or uncategorized items to reference or queue
      if (to === 'reference' || to === 'queued') return true;
      return false;
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const topic = await db.topic.findUnique({
      where: { id: params.id },
      include: {
        activityLogs: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    return NextResponse.json(topic);
  } catch (e) {
    console.error('Failed to get topic:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    const id = params.id;
    const body = await request.json();
    console.log('API PUT topic ID:', id, 'body:', body);

    // Fetch existing topic
    const existing = await db.topic.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const newStatus = body.status || existing.status;
    const newStage = body.currentStage || existing.currentStage;
    const newNextAction = body.nextAction !== undefined ? body.nextAction : existing.nextAction;
    const newWhy = body.why !== undefined ? body.why : existing.why;
    const newDepth = body.depthTarget !== undefined ? body.depthTarget : existing.depthTarget;
    const newProgress = body.progressPct !== undefined ? body.progressPct : existing.progressPct;

    // 1. Enforce Transition Rules (if status is changing)
    if (body.status && body.status !== existing.status) {
      if (!isValidTransition(existing.status, body.status)) {
        return NextResponse.json(
          { error: `Invalid transition from "${existing.status}" to "${body.status}".` },
          { status: 400 }
        );
      }
    }

    // 2. Enforce Active Topic Limit and Slot Types
    let finalActiveSlotType = body.activeSlotType !== undefined ? body.activeSlotType : existing.activeSlotType;
    if (newStatus === 'active') {
      const activeTopics = await db.topic.findMany({
        where: { status: 'active', id: { not: id } }
      });
      if (activeTopics.length >= 2) {
        return NextResponse.json(
          { error: 'Active limit reached. You already have 2 active topics. Please pause or drop one before activating another.' },
          { status: 400 }
        );
      }
      if (!finalActiveSlotType) {
        const hasPrimary = activeTopics.some(t => t.activeSlotType === 'primary');
        finalActiveSlotType = hasPrimary ? 'secondary' : 'primary';
      }
    } else {
      finalActiveSlotType = null;
    }

    // 3. Enforce Field Validations
    if (newStatus === 'active') {
      if (!newWhy || !newWhy.trim()) {
        return NextResponse.json({ error: 'Why you are learning is required for active topics.' }, { status: 400 });
      }
      if (!newDepth || !newDepth.trim()) {
        return NextResponse.json({ error: 'Depth target is required for active topics.' }, { status: 400 });
      }
      if (!newNextAction || !newNextAction.trim()) {
        return NextResponse.json({ error: 'A concrete Next Action is required for active topics.' }, { status: 400 });
      }
    }

    if (newStatus === 'paused') {
      if (!newNextAction || !newNextAction.trim()) {
        return NextResponse.json({ error: 'A concrete Next Action is required to pause a topic.' }, { status: 400 });
      }
    }

    // 4. Determine first started date
    let startedDate = existing.startedDate;
    if (newStatus === 'active' && !existing.startedDate) {
      startedDate = new Date();
    }

    // 5. Update Topic
    const updated = await db.topic.update({
      where: { id },
      data: {
        title: body.title !== undefined ? body.title : existing.title,
        area: body.area !== undefined ? body.area : existing.area,
        why: newWhy,
        depthTarget: newDepth,
        status: newStatus,
        progressPct: newProgress,
        currentStage: newStage,
        lastCompleted: body.lastCompleted !== undefined ? body.lastCompleted : existing.lastCompleted,
        nextAction: newNextAction,
        proofOfLearning: body.proofOfLearning !== undefined ? body.proofOfLearning : existing.proofOfLearning,
        resources: body.resources !== undefined ? body.resources : existing.resources,
        subtasks: body.subtasks !== undefined ? body.subtasks : existing.subtasks,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        startedDate,
        contract: body.contract !== undefined ? body.contract : existing.contract,
        knowledgeMap: body.knowledgeMap !== undefined ? body.knowledgeMap : existing.knowledgeMap,
        confusions: body.confusions !== undefined ? body.confusions : existing.confusions,
        mistakes: body.mistakes !== undefined ? body.mistakes : existing.mistakes,
        pauseHistory: body.pauseHistory !== undefined ? body.pauseHistory : existing.pauseHistory,
        activeSlotType: finalActiveSlotType,
        sessionLogs: body.sessionLogs !== undefined ? body.sessionLogs : (existing as any).sessionLogs,
        topicMode: body.topicMode !== undefined ? body.topicMode : (existing as any).topicMode,
        curriculum: body.curriculum !== undefined ? body.curriculum : (existing as any).curriculum,
      },
    });

    // 6. Track changes in ActivityLog
    const fieldsToTrack: Array<keyof typeof existing> = ['status', 'currentStage', 'nextAction', 'progressPct', 'title'];
    for (const field of fieldsToTrack) {
      const oldVal = existing[field];
      const newVal = updated[field];

      // Format values for storage
      const oldStr = oldVal instanceof Date ? oldVal.toISOString() : oldVal !== null && oldVal !== undefined ? String(oldVal) : null;
      const newStr = newVal instanceof Date ? newVal.toISOString() : newVal !== null && newVal !== undefined ? String(newVal) : null;

      if (oldStr !== newStr) {
        await db.activityLog.create({
          data: {
            topicId: id,
            fieldChanged: field,
            oldValue: oldStr,
            newValue: newStr,
          },
        });
      }
    }

    const updatedWithLogs = await db.topic.findUnique({
      where: { id },
      include: {
        activityLogs: {
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    return NextResponse.json(updatedWithLogs || updated);
  } catch (e) {
    console.error('Failed to update topic:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResponse = checkAuth();
  if (authResponse) return authResponse;

  try {
    await db.topic.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete topic:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
