import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { extractJson, fixPrompt, toChatPrompt } from '@/lib/ai/manual';
import { logManualImport } from '@/lib/ai/callLog';
import { buildAssistMessages, cleanAssistInput, lessonTextForAssist, normalizeAssistReply } from '@/lib/lessonAssist';

export const maxDuration = 60;

/**
 * Ask, Add or Improve. Returns a draft and saves nothing, so you can look at
 * it first. With mode "manual", step "prompt" gives a prompt for your own
 * chat and step "import" reads the pasted reply, at no cost to the app.
 */
export async function POST(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = cleanAssistInput(body);
    if (!input) return NextResponse.json({ error: 'Say what you’d like.' }, { status: 400 });
    const manual = body.mode === 'manual' ? (body.step === 'import' ? 'import' : 'prompt') : null;

    const [lesson, topic] = await Promise.all([
      db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId, topic: { deletedAt: null } } }),
      db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { title: true, contract: true } }),
    ]);
    if (!lesson || !topic) return NextResponse.json({ error: 'Open the lesson first.' }, { status: 400 });

    const messages = buildAssistMessages({
      ...input,
      topicTitle: topic.title,
      moduleTitle: lesson.moduleTitle,
      learnerLevel: String((topic.contract as Record<string, unknown> | null)?.currentLevel ?? 'beginner'),
      lessonText: lessonTextForAssist(lesson.content as Record<string, unknown>),
    });
    if (manual === 'prompt') return NextResponse.json({ prompt: toChatPrompt(messages) });

    if (!manual) {
      if (!hasAnyAIProviderConfigured()) return NextResponse.json({ error: 'The app’s AI isn’t set up, so use your own chat for this.', needsManual: true }, { status: 503 });
      const overQuota = await aiQuotaGate(userId);
      if (overQuota) return overQuota;
    }

    let raw: unknown = null;
    if (manual === 'import') {
      const found = extractJson(typeof body.reply === 'string' ? body.reply : '');
      if (!found.ok) return NextResponse.json({ problems: [found.problem], fixPrompt: fixPrompt([found.problem]) }, { status: 422 });
      raw = found.value;
    } else {
      const out = await callAIContent(messages, { purpose: 'lesson.assist', temperature: 0.35, tier: 'content', maxTokens: 3000, jsonMode: true });
      try { raw = JSON.parse(out.content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { raw = null; }
    }

    const draft = normalizeAssistReply(raw, input.action);
    if (!draft) {
      const problems = ['The reply wasn’t in the expected format.'];
      return manual
        ? NextResponse.json({ problems, fixPrompt: fixPrompt(problems) }, { status: 422 })
        : NextResponse.json({ error: 'That didn’t work. Try again.' }, { status: 502 });
    }
    if (manual) await logManualImport('lesson.assist', userId, 'manual');
    return NextResponse.json({ draft });
  } catch (e) {
    console.error('Lesson assist failed:', e);
    return NextResponse.json({ error: 'That didn’t work. Try again.' }, { status: 500 });
  }
}
