import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';

/**
 * Saves the learner's work on one lesson exercise (their answer, the AI's
 * check, done or not) inside their saved lesson, so coming back shows it
 * again instead of an empty box and a second paid check.
 */
export async function PUT(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const index = Number(b.index);
  if (!Number.isInteger(index) || index < 0 || index > 50) return NextResponse.json({ error: 'index is required' }, { status: 400 });

  const lesson = await db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId, topic: { deletedAt: null } } });
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  const r = b.result as Record<string, unknown> | null | undefined;
  const entry = {
    answer: typeof b.answer === 'string' ? b.answer.slice(0, 4000) : '',
    done: b.done === true,
    result: r && ['correct', 'partly', 'wrong'].includes(String(r.verdict))
      ? { verdict: String(r.verdict), feedback: String(r.feedback ?? '').slice(0, 800), corrected: String(r.corrected ?? '').slice(0, 2000) }
      : null,
    at: new Date().toISOString(),
  };
  const content = (lesson.content ?? {}) as Record<string, unknown>;
  const practice = { ...((content.practice as Record<string, unknown>) ?? {}), [index]: entry };
  await db.generatedLesson.update({ where: { id: lesson.id }, data: { content: { ...content, practice } as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true });
}
