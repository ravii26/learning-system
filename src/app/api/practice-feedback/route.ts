import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { extractJson, fixPrompt, toChatPrompt } from '@/lib/ai/manual';
import { logManualImport } from '@/lib/ai/callLog';
import { getRubricTemplate } from '@/lib/practiceRubrics';
import { buildFeedbackMessages, parseFeedback, speechStats } from '@/lib/practiceFeedback';
import type { Intake } from '@/lib/program/types';

export const maxDuration = 60;

/**
 * Coach feedback on one practice rep: the app's own measurements (words,
 * pace, filler words) plus AI scores on the topic's rubric, fixes and a
 * better version. With { mode: 'manual' } the learner's own ChatGPT/Claude
 * writes it instead (step "prompt", then step "import" with their reply).
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const topicId = s(b.topicId, 60);
  const promptText = s(b.promptText, 1000);
  const answer = s(b.answer, 8000);
  const seconds = Number(b.durationSeconds);
  if (!topicId || !promptText) return NextResponse.json({ error: 'topicId and promptText are required' }, { status: 400 });
  if (answer.split(/\s+/).length < 5) return NextResponse.json({ error: 'Say or write a bit more first (at least a sentence or two).' }, { status: 400 });

  const topic = await db.topic.findFirst({ where: { id: topicId, userId, deletedAt: null }, select: { title: true, rubricTemplate: true } });
  if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
  const template = getRubricTemplate(topic.rubricTemplate);
  const stats = speechStats(answer, Number.isFinite(seconds) ? seconds : null);

  const item = await db.programItem.findFirst({ where: { userId, topicId, program: { status: 'active' } }, select: { program: { select: { intake: true } } } });
  const intake = item?.program.intake as unknown as Intake | undefined;
  const context = intake
    ? [intake.doneMeans || intake.goal, ...(intake.answers ?? []).map((a) => `${a.question} ${a.answer}`)].join('; ').slice(0, 800)
    : undefined;
  const messages = buildFeedbackMessages({ skill: topic.title, promptText, answer, spoken: b.spoken === true, stats, template, context });

  if (b.mode === 'manual') {
    if (b.step !== 'import') return NextResponse.json({ prompt: toChatPrompt(messages), stats });
    const found = extractJson(s(b.reply, 20000));
    const feedback = found.ok ? parseFeedback(found.value, template) : null;
    if (!feedback) {
      const problems = [found.ok ? `The feedback needs a score from 1 to 5 for each of: ${template.dimensions.map((d) => d.key).join(', ')}.` : found.problem];
      return NextResponse.json({ error: 'That reply couldn’t be used.', problems, fixPrompt: fixPrompt(problems) }, { status: 422 });
    }
    await logManualImport('practice.feedback', userId);
    return NextResponse.json({ feedback, stats });
  }

  if (!hasAnyAIProviderConfigured()) return NextResponse.json({ error: 'Feedback needs the AI, which is not set up.', stats }, { status: 503 });
  const overQuota = await aiQuotaGate(userId);
  if (overQuota) return overQuota;
  try {
    const { content } = await callAIContent(messages, { purpose: 'practice.feedback', temperature: 0.2, jsonMode: true, tier: 'content', maxTokens: 3000 });
    const feedback = parseFeedback(content, template);
    if (!feedback) return NextResponse.json({ error: 'The feedback came back incomplete. Try again.', stats }, { status: 502 });
    return NextResponse.json({ feedback, stats });
  } catch (e) {
    console.error('Practice feedback failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not get feedback right now. Try again in a minute.', stats }, { status: 502 });
  }
}
