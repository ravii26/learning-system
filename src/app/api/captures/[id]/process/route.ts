import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/**
 * The weekly triage ritual, one capture at a time: turn it into a Note, a
 * Concept (attached to an existing topic), a Topic, or archive it. See the
 * project plan's Example C — this is the only place a CaptureItem's fate
 * gets decided; POST /api/captures never does.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const capture = await db.captureItem.findFirst({ where: { id: params.id, userId } });
    if (!capture) {
      return NextResponse.json({ error: 'Capture not found' }, { status: 404 });
    }
    if (capture.status === 'processed' || capture.status === 'archived') {
      return NextResponse.json({ error: `Already ${capture.status}` }, { status: 400 });
    }

    const body = await request.json();
    const { action } = body as { action?: 'note' | 'concept' | 'topic' | 'archive' };

    const defaultTitle = capture.title || capture.rawText?.slice(0, 80) || 'Untitled';

    if (action === 'note') {
      const note = await db.note.create({
        data: {
          userId,
          title: (body.title || defaultTitle).trim(),
          body: body.body || capture.highlight || capture.rawText || '',
          tags: capture.tags,
          sourceCaptureId: capture.id,
        },
      });
      const updated = await db.captureItem.update({
        where: { id: capture.id },
        data: { status: 'processed', processedAt: new Date(), resultNoteId: note.id },
      });
      return NextResponse.json({ capture: updated, note });
    }

    if (action === 'concept') {
      const { topicId } = body as { topicId?: string };
      if (!topicId) {
        return NextResponse.json({ error: 'topicId is required to create a concept' }, { status: 400 });
      }
      const topic = await db.topic.findFirst({ where: { id: topicId, userId } });
      if (!topic) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
      }
      const concept = await db.concept.create({
        data: {
          userId,
          topicId,
          title: (body.title || defaultTitle).trim(),
        },
      });
      const updated = await db.captureItem.update({
        where: { id: capture.id },
        data: { status: 'processed', processedAt: new Date(), resultConceptId: concept.id },
      });
      return NextResponse.json({ capture: updated, concept });
    }

    if (action === 'topic') {
      // Linking to an already-created topic (e.g. Exploration Mode, which
      // creates the topic itself via its own nuanced status mapping and
      // just needs this capture marked processed against it) rather than
      // creating a new one.
      const { existingTopicId } = body as { existingTopicId?: string };
      if (existingTopicId) {
        const existingTopic = await db.topic.findFirst({ where: { id: existingTopicId, userId } });
        if (!existingTopic) {
          return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
        }
        const updated = await db.captureItem.update({
          where: { id: capture.id },
          data: { status: 'processed', processedAt: new Date(), resultTopicId: existingTopic.id },
        });
        return NextResponse.json({ capture: updated, topic: existingTopic });
      }

      const topic = await db.topic.create({
        data: {
          userId,
          title: (body.title || defaultTitle).trim(),
          area: body.area || 'Other',
          status: 'inbox',
          progressPct: 0,
          currentStage: 'Define',
          notes: capture.rawText || null,
          resources: capture.url ? [{ title: capture.title || capture.url, type: 'WEBSITE', url: capture.url, purpose: '', status: 'queued', notes: '' }] : [],
          subtasks: [],
          contract: { outcome: '', estimatedEffort: 0, successCriterion: '', currentLevel: 'Beginner', prerequisites: [] },
          knowledgeMap: { concepts: [] },
          confusions: [],
          mistakes: [],
          pauseHistory: [],
          curriculum: [],
        },
      });
      const updated = await db.captureItem.update({
        where: { id: capture.id },
        data: { status: 'processed', processedAt: new Date(), resultTopicId: topic.id },
      });
      return NextResponse.json({ capture: updated, topic });
    }

    if (action === 'archive') {
      const updated = await db.captureItem.update({
        where: { id: capture.id },
        data: { status: 'archived', processedAt: new Date() },
      });
      return NextResponse.json({ capture: updated });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    console.error('Failed to process capture:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
