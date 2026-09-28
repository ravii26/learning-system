import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { buildQuestionMessages, parseQuestions } from '@/lib/program/questions';
import { guessArchetype } from '@/lib/program/fieldGuide';

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
