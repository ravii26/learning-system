import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { ensureAreaSkillId } from '@/lib/areaSkill';
import { syncTopicListsAndMirror } from '@/lib/topicListSync';
import { mirrorConfusionsToJson } from '@/lib/confusionSync';
import { randomUUID } from 'crypto';

/**
 * The weekly triage ritual, one capture at a time: turn it into a Note, a
 * Concept (attached to an existing topic), an open question on a topic, a
 * Topic, or archive it. See the
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
    const { action } = body as { action?: 'note' | 'concept' | 'question' | 'topic' | 'archive' };

    const defaultTitle = capture.title || capture.rawText?.slice(0, 80) || 'Untitled';

    if (action === 'note') {
      // Optional: attach the note to a topic (e.g. an accretion topic like
      // "Investing") — picked in the inbox's topic dropdown.
      const { topicId } = body as { topicId?: string };
      if (topicId && !(await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } }))) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
      }
      const note = await db.note.create({
        data: {
          userId,
          title: (body.title || defaultTitle).trim(),
          body: body.body || capture.highlight || capture.url || capture.rawText || '',
          tags: capture.tags,
          topicId: topicId || null,
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
      const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null } });
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

    if (action === 'question') {
      // An open question on the topic (a Confusion row). Lesson generation
      // reads a topic's unresolved questions, so the next lesson on it
      // addresses this one.
      const { topicId } = body as { topicId?: string };
      if (!topicId) {
        return NextResponse.json({ error: 'topicId is required for a question' }, { status: 400 });
      }
      const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { id: true } });
      if (!topic) {
        return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
      }
      const text = (capture.rawText || capture.title || defaultTitle).trim();
      const { confusion, updated } = await db.$transaction(async (tx) => {
        // legacyId set up front: the topic page syncs confusions by it, and
        // a row without one would be re-created as a duplicate on its next save.
        const confusion = await tx.confusion.create({ data: { userId, topicId, text, legacyId: randomUUID().slice(0, 8) } });
        await tx.topic.update({ where: { id: topicId }, data: { confusions: (await mirrorConfusionsToJson(tx, topicId)) as object[] } });
        const captureRow = await tx.captureItem.update({
          where: { id: capture.id },
          data: { status: 'processed', processedAt: new Date(), resultTopicId: topicId },
        });
        return { confusion, updated: captureRow };
      });
      return NextResponse.json({ capture: updated, confusion });
    }

    if (action === 'topic') {
      // Linking to an already-created topic (e.g. Exploration Mode, which
      // creates the topic itself via its own nuanced status mapping and
      // just needs this capture marked processed against it) rather than
      // creating a new one.
      const { existingTopicId } = body as { existingTopicId?: string };
      if (existingTopicId) {
        const existingTopic = await db.topic.findFirst({ where: { id: existingTopicId, userId, deletedAt: null } });
        if (!existingTopic) {
          return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
        }
        const updated = await db.captureItem.update({
          where: { id: capture.id },
          data: { status: 'processed', processedAt: new Date(), resultTopicId: existingTopic.id },
        });
        return NextResponse.json({ capture: updated, topic: existingTopic });
      }

      const area = body.area || 'Other';
      const skillId = await ensureAreaSkillId(db, userId, area);
      // A captured URL becomes the topic's first bookmark. NOT_STARTED, not
      // 'queued' — the resource status the UI cycles through.
      const resources = capture.url
        ? [{ title: capture.title || capture.url, type: 'WEBSITE', url: capture.url, purpose: '', status: 'NOT_STARTED', notes: '' }]
        : [];
      const { topic, updated } = await db.$transaction(async (tx) => {
        const created = await tx.topic.create({
          data: {
            userId,
            title: (body.title || defaultTitle).trim(),
            area,
            skillId,
            status: 'inbox',
            progressPct: 0,
            currentStage: 'Define',
            notes: capture.rawText || null,
            resources,
            subtasks: [],
            contract: { outcome: '', estimatedEffort: 0, successCriterion: '', currentLevel: 'Beginner', prerequisites: [] },
            knowledgeMap: { concepts: [] },
            confusions: [],
            mistakes: [],
            pauseHistory: [],
            curriculum: [],
          },
        });
        await syncTopicListsAndMirror(tx, userId, created.id, { resources });
        const captureRow = await tx.captureItem.update({
          where: { id: capture.id },
          data: { status: 'processed', processedAt: new Date(), resultTopicId: created.id },
        });
        return { topic: await tx.topic.findUniqueOrThrow({ where: { id: created.id } }), updated: captureRow };
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
