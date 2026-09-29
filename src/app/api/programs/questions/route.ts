import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { buildQuestionMessages, parseQuestions } from '@/lib/program/questions';
import { guessArchetype } from '@/lib/program/fieldGuide';
import { extractJson, fixPrompt, toChatPrompt } from '@/lib/ai/manual';
import { logManualImport } from '@/lib/ai/callLog';

export const maxDuration = 60;

/**
 * The few questions a good teacher asks before planning ("English for what
 * situation?", "What's hardest for you?"). Their answers go into the topic
 * list draft. Without the AI, the plan is still built, just without them.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = (await request.json().catch(() => ({}))) as { goal?: unknown };
  const goal = typeof body.goal === 'string' ? body.goal.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  if (goal.length < 3) return NextResponse.json({ error: 'Tell us what you want to learn.' }, { status: 400 });

  const b = body as { mode?: unknown; step?: unknown; reply?: unknown };
  if (b.mode === 'manual') {
    if (b.step !== 'import') return NextResponse.json({ prompt: toChatPrompt(buildQuestionMessages(goal)) });
    const found = extractJson(typeof b.reply === 'string' ? b.reply : '');
    const q = found.ok ? parseQuestions(JSON.stringify(found.value), goal) : null;
    if (!q || q.questions.length === 0) {
      const problems = [found.ok ? 'No usable questions were found (each needs a question and at least 2 options).' : found.problem];
      return NextResponse.json({ error: 'That reply couldn’t be used.', problems, fixPrompt: fixPrompt(problems) }, { status: 422 });
    }
    await logManualImport('plan.questions', userId);
    return NextResponse.json(q);
  }

  if (!hasAnyAIProviderConfigured()) {
    return NextResponse.json({ archetype: guessArchetype(goal), fieldTitle: goal, questions: [] });
  }
  const overQuota = await aiQuotaGate(userId);
  if (overQuota) return overQuota;
  try {
    const { content } = await callAIContent(buildQuestionMessages(goal), { purpose: 'plan.questions', temperature: 0.3, jsonMode: true, tier: 'plan', maxTokens: 2500 });
    return NextResponse.json(parseQuestions(content, goal));
  } catch (e) {
    // No questions is a worse plan, not a broken one: carry on without them.
    console.warn('Could not generate goal questions:', e instanceof Error ? e.message : e);
    return NextResponse.json({ archetype: guessArchetype(goal), fieldTitle: goal, questions: [] });
  }
}
