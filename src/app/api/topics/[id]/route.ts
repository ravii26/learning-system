import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { validateTopicPayload } from '@/lib/validations/topic';
import { buildTopicUpdateData } from '@/lib/topicUpdate';
import { syncConceptsFromJson } from '@/lib/conceptSync';

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
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({
      where: { id: params.id, userId },
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
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const id = params.id;
    const rawBody = await request.json();
    const validation = validateTopicPayload(rawBody, false);
    if (!validation.isValid || !validation.payload) {
      return NextResponse.json({ error: validation.error || 'Invalid payload' }, { status: 400 });
    }
    const body = validation.payload;

    // Fetch existing topic, scoped to this user — a topic id belonging to
    // someone else must 404, not leak via a cross-user update.
    const existing = await db.topic.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    const newStatus = body.status || existing.status;
    const newNextAction = body.nextAction !== undefined ? body.nextAction : existing.nextAction;
    const newWhy = body.why !== undefined ? body.why : existing.why;
    const newDepth = body.depthTarget !== undefined ? body.depthTarget : existing.depthTarget;

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
        where: { status: 'active', userId, id: { not: id } }
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

    // 4.5. Structural concept-map edits (add/delete a concept in
    // KnowledgeMap.tsx, or the AI-generate-map flow) PUT the client's whole
    // concepts array here, unchanged since before this migration. Concept
    // rows are the source of truth as of Phase 3, so reconcile rows against
    // the incoming array and replace body.knowledgeMap with the rebuilt
    // canonical JSON before it's written — never trust the client's array
    // verbatim once rows exist. See src/lib/conceptSync.ts.
    if (body.knowledgeMap && Array.isArray((body.knowledgeMap as any).concepts)) {
      const synced = await db.$transaction((tx) =>
        syncConceptsFromJson(tx, userId, id, (body.knowledgeMap as any).concepts)
      );
      body.knowledgeMap = synced.json;
    }

    // 5. Update Topic
    //
    // Only write columns the client actually sent.
    //
    // This previously wrote EVERY column on every PUT, falling back to the
    // value read by the findUnique above. Two ways that lost data:
    //   1. Any write landing between that read and this update was silently
    //      reverted — /api/review/spaced writes knowledgeMap, so an unrelated
    //      autosave here would roll back review scheduling.
    //   2. It made a full-object PUT look harmless, so the client sends one.
    // A key absent from the body must leave its column untouched.
    const data = buildTopicUpdateData(body, {
      status: newStatus,
      activeSlotType: finalActiveSlotType,
      startedDate,
    });

    const updated = await db.topic.update({ where: { id }, data });

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
            userId,
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
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // deleteMany, not delete: `delete` requires a unique `where` (id alone),
    // which would let a request delete another user's topic by id. Scoping
    // by userId here means a foreign id deletes nothing rather than leaking
    // a cross-user 500 from a broken unique-constraint lookup.
    const result = await db.topic.deleteMany({
      where: { id: params.id, userId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Failed to delete topic:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
