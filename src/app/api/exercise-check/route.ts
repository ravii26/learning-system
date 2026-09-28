import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { aiQuotaGate } from '@/lib/rateLimit';
import { callAIContent, hasAnyAIProviderConfigured } from '@/lib/ai/aiClient';
import { buildCheckMessages, parseCheck } from '@/lib/program/exerciseCheck';

export const maxDuration = 60;

/**
 * Checks one practice answer (typed, or spoken and transcribed) against the
 * exercise's model answer, the way a teacher marks it: right or not, what
 * exactly is wrong, and the corrected version.
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const input = {
    subject: str(b.subject, 200),
    instruction: str(b.instruction, 300),
    prompt: str(b.prompt, 1500),
    modelAnswer: str(b.modelAnswer, 2000),
    answer: str(b.answer, 4000),
    spoken: b.spoken === true,
  };
  if (!input.answer) return NextResponse.json({ error: 'Write or say your answer first.' }, { status: 400 });
  if (!hasAnyAIProviderConfigured()) return NextResponse.json({ error: 'Checking needs the AI, which is not set up. Compare with the model answer instead.' }, { status: 503 });

  const overQuota = await aiQuotaGate(userId);
  if (overQuota) return overQuota;
  try {
    const { content } = await callAIContent(buildCheckMessages(input), { purpose: 'exercise.check', temperature: 0.1, jsonMode: true, tier: 'content', maxTokens: 1200 });
    const result = parseCheck(content);
    if (!result) return NextResponse.json({ error: 'Could not check this one. Compare with the model answer.' }, { status: 502 });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Exercise check failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Could not check this one right now. Compare with the model answer.' }, { status: 502 });
  }
}
