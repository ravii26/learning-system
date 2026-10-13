import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { mirrorCurriculumToJson } from '@/lib/curriculumSync';
import { KIND_BLOCKS, isLessonKind, lessonKindOf } from '@/lib/lessonKinds';
import { normalizeBlueprint } from '@/lib/lessonBlocks';

/**
 * Changes what a lesson is meant to be (its kind and its sections).
 * Body: { kind, blueprint? }.
 *
 * A lesson that was already written is NOT touched: it stays readable, and
 * the response says it needs regenerating to match. Sections that the new
 * kind cannot have are dropped; leaving them out means "the kind's defaults".
 */
export async function PATCH(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; blueprint?: unknown };
    if (!isLessonKind(body.kind)) return NextResponse.json({ error: 'Unknown kind of lesson.' }, { status: 400 });
    const kind = body.kind;

    const item = await db.curriculumItem.findFirst({
      where: { userId, topicId: params.id, legacyId: params.moduleId, removed: false, topic: { deletedAt: null } },
      select: { id: true },
    });
    if (!item) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });

    // Stored as [] when it means "the defaults", the same convention the module sync uses.
    const blueprint = normalizeBlueprint(body.blueprint, KIND_BLOCKS[kind]);
    await db.$transaction(async (tx) => {
      await tx.curriculumItem.update({ where: { id: item.id }, data: { kind, blueprint: blueprint as unknown as Prisma.InputJsonValue } });
      // Topic.curriculum is a mirror of the rows; keep it in step so the topic page shows the new kind.
      const mirror = await mirrorCurriculumToJson(tx, params.id);
      await tx.topic.update({ where: { id: params.id }, data: { curriculum: mirror as unknown as Prisma.InputJsonValue } });
    });

    const saved = await db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId }, select: { content: true } });
    const writtenKind = saved ? lessonKindOf((saved.content as Record<string, unknown> | null)?.kind) : null;
    return NextResponse.json({ kind, blueprint, written: writtenKind !== null, needsRegenerate: writtenKind !== null && writtenKind !== kind });
  } catch (e) {
    console.error('Failed to change a lesson kind:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
