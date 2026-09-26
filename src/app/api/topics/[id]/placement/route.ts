import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { buildPlacementMessages, parsePlacement, planPlacement } from '@/lib/placement';

/**
 * Writes a placement check for the modules you haven't finished and stores
 * it. The response leaves out the correct answers; grading happens on
 * submit (POST /api/placement/[id]).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const topic = await db.topic.findFirst({
      where: { id: params.id, userId, deletedAt: null },
      select: { id: true, title: true, depthTarget: true },
    });
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const open = await db.curriculumItem.findMany({
      where: { userId, topicId: params.id, removed: false, completed: false },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { legacyId: true, title: true },
    });
    if (open.length === 0) {
      return NextResponse.json({ error: 'Every module is already finished — nothing to place out of.' }, { status: 400 });
    }
    if (!hasAnyAIProviderConfigured()) {
      return NextResponse.json({ error: 'The placement check needs an AI provider, and none is configured.' }, { status: 503 });
    }

    const plan = planPlacement(open.map((m) => ({ id: m.legacyId, title: m.title })));
    let questions;
    try {
      const { content } = await callAIContent(buildPlacementMessages(topic.title, topic.depthTarget, plan), { temperature: 0.3, jsonMode: true });
      questions = parsePlacement(content, plan);
    } catch (e) {
      console.warn('Placement check generation failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ error: 'Couldn’t write the check right now. Try again in a minute.' }, { status: 502 });
    }
    if (questions.length === 0) {
      return NextResponse.json({ error: 'Couldn’t write usable questions for this syllabus. Try again.' }, { status: 502 });
    }

    const check = await db.placementCheck.create({
      data: { userId, topicId: params.id, questions: questions as unknown as Prisma.InputJsonValue },
    });
    const titles = new Map(plan.modules.map((m) => [m.id, m.title]));
    return NextResponse.json({
      id: check.id,
      questions: questions.map((q) => ({ moduleId: q.moduleId, moduleTitle: titles.get(q.moduleId) ?? '', question: q.question, options: q.options })),
    });
  } catch (e) {
    console.error('Failed to create placement check:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
