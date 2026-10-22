import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { extractJson, fixPrompt, toChatPrompt } from '@/lib/ai/manual';
import { logManualImport } from '@/lib/ai/callLog';
import { buildBlockMessages } from '@/lib/decisionLesson';
import { normalizeBlocks } from '@/lib/lessonBlocks';
import { lessonKindOf } from '@/lib/lessonKinds';

export const maxDuration = 60;

/**
 * Rewrites ONE section (block) of a saved lesson, leaving the rest alone.
 * Body: { index }. With mode "manual", step "prompt" returns a prompt for the
 * learner's own chat and step "import" takes the pasted reply, so it costs
 * nothing; otherwise the app's AI writes it.
 *
 * The reply must be the same kind of section as the one it replaces, and it
 * goes through the same checks as a whole lesson before anything is saved.
 */
export async function POST(request: Request, { params }: { params: { id: string; moduleId: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as { index?: unknown; mode?: string; step?: string; reply?: unknown };
    const manual = body.mode === 'manual' ? (body.step === 'import' ? 'import' : 'prompt') : null;

    const lesson = await db.generatedLesson.findFirst({ where: { userId, topicId: params.id, moduleId: params.moduleId, topic: { deletedAt: null } } });
    if (!lesson) return NextResponse.json({ error: 'Open the lesson first.' }, { status: 400 });
    const content = lesson.content as Record<string, unknown>;
    const blocks = normalizeBlocks(content.blocks);
    const index = body.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= blocks.length) {
      return NextResponse.json({ error: 'That section does not exist.' }, { status: 400 });
    }
    const current = blocks[index];

    const topic = await db.topic.findFirst({ where: { id: params.id, userId, deletedAt: null }, select: { title: true, contract: true } });
    const level = String((topic?.contract as Record<string, unknown> | null)?.currentLevel ?? 'beginner');
    const messages = buildBlockMessages({
      kind: lessonKindOf(content.kind),
      topicTitle: topic?.title ?? '',
      moduleTitle: lesson.moduleTitle,
      learnerLevel: level,
      today: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      current,
      others: blocks.filter((_, i) => i !== index),
    });
    if (manual === 'prompt') return NextResponse.json({ prompt: toChatPrompt(messages) });

    if (!manual) {
      if (!hasAnyAIProviderConfigured()) return NextResponse.json({ error: 'Rewriting a section needs the AI, which is not configured.' }, { status: 503 });
      const overQuota = await aiQuotaGate(userId);
      if (overQuota) return overQuota;
    }

    let raw: unknown;
    let provider = 'manual';
    if (manual === 'import') {
      const found = extractJson(typeof body.reply === 'string' ? body.reply : '');
      if (!found.ok) return NextResponse.json({ problems: [found.problem], fixPrompt: fixPrompt([found.problem]) }, { status: 422 });
      raw = found.value;
    } else {
      const out = await callAIContent(messages, { purpose: 'lesson.block', temperature: 0.35, tier: 'content', maxTokens: 3000, jsonMode: true });
      provider = out.provider;
      try { raw = JSON.parse(out.content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { raw = null; }
    }

    // The model may wrap it ({ "block": {...} }); accept either.
    const candidate = raw && typeof raw === 'object' && 'block' in (raw as object) ? (raw as { block: unknown }).block : raw;
    const [next] = normalizeBlocks([candidate]);
    if (!next || next.type !== current.type) {
      const problems = [`The reply needs to be one "${current.type}" section.`];
      return manual
        ? NextResponse.json({ problems, fixPrompt: fixPrompt(problems) }, { status: 422 })
        : NextResponse.json({ error: 'Could not rewrite that section. Try again.' }, { status: 502 });
    }

    const updated = blocks.map((b, i) => (i === index ? next : b));
    await db.generatedLesson.update({ where: { id: lesson.id }, data: { content: { ...content, blocks: updated } as unknown as Prisma.InputJsonValue } });
    if (manual) await logManualImport('lesson.block', userId, provider);
    return NextResponse.json({ blocks: updated });
  } catch (e) {
    console.error('Failed to rewrite a lesson section:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
