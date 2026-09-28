import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { isValidQuizQuestion } from '@/lib/reviewCards';
import { htmlToText } from '@/lib/htmlText';

const QUIZ_SIZES = [5, 10, 20] as const;

/**
 * A fresh multiple-choice quiz of 5, 10 or 20 questions for a module, written
 * from that module's saved lesson. It replaces the module's current quiz, so
 * the attempts route keeps scoring on the server against what was shown.
 */
export async function POST(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const { count } = (await request.json().catch(() => ({}))) as { count?: number };
    if (!QUIZ_SIZES.includes(count as 5)) return NextResponse.json({ error: 'count must be 5, 10 or 20' }, { status: 400 });
    if (!hasAnyAIProviderConfigured()) return NextResponse.json({ error: 'Quiz generation needs the AI, which is not configured.' }, { status: 503 });

    const lesson = await db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId, topic: { deletedAt: null } } });
    if (!lesson) return NextResponse.json({ error: 'Open the lesson first, then make a quiz from it.' }, { status: 400 });
    const overQuota = await aiQuotaGate(userId);
    if (overQuota) return overQuota;

    const c = lesson.content as Record<string, unknown>;
    const text = [c.summary, c.explanation, c.codeOrExample, ...(Array.isArray(c.keyTakeaways) ? c.keyTakeaways : [])]
      .filter((x) => typeof x === 'string').map((x) => htmlToText(x as string, 3000)).join('\n').slice(0, 6000);

    const { content } = await callAIContent([
      { role: 'system', content: 'You write accurate multiple-choice questions that test understanding, not memorised wording. Return valid JSON only.' },
      { role: 'user', content: `Module: ${lesson.moduleTitle}
Lesson:
${text}

Write exactly ${count} multiple-choice questions on this module: a mix of concept, application, prediction and edge-case questions, easy to hard. Each has 4 plausible options, one correct, and a short explanation of why. Vary which option is correct. No "all of the above".
Return JSON: { "quiz": [ { "question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "..." } ] }` },
    ], { purpose: 'quiz', temperature: 0.4, jsonMode: true });

    let parsed: any;
    try { parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { parsed = null; }
    // Shuffle each question's options: models favour putting the answer early,
    // and learners pick up on patterns like that.
    const quiz = (Array.isArray(parsed?.quiz) ? parsed.quiz : []).filter(isValidQuizQuestion).slice(0, count).map((q: any) => {
      const order = q.options.map((_: unknown, i: number) => i).sort(() => Math.random() - 0.5);
      return { ...q, options: order.map((i: number) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
    });
    if (quiz.length < Math.min(count!, 3)) return NextResponse.json({ error: 'Could not write the quiz. Try again.' }, { status: 502 });

    await db.generatedLesson.update({ where: { id: lesson.id }, data: { content: { ...c, quiz } as Prisma.InputJsonValue } });
    return NextResponse.json({ quiz });
  } catch (e) {
    console.error('Failed to generate quiz:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
