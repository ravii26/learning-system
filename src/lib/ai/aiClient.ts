/**
 * The single entry point every AI-backed route should call, instead of
 * reaching for a provider client directly. Tries AICredits first
 * (Ravindra's purchased credits at aicredits.in), then Gemini directly
 * (GEMINI_API_KEY, Google's free tier), then Groq — per his instruction:
 * "Try AICredits first then as a fallback go to others."
 *
 * Each provider already retries across its own candidate models before
 * giving up (see groqClient.ts / aiCreditsClient.ts) — this module only
 * adds the provider-level fallback on top of that.
 */
import { callGroqContent, GroqCallError, type GroqMessage } from './groqClient';
import { callAICreditsContent, AICreditsCallError, type AICreditsMessage } from './aiCreditsClient';
import { getSessionUserId } from '../auth';
import { consumeAiQuota } from '../rateLimit';
import { callGeminiContent } from './geminiClient';
import { assertWithinDailyBudget, logAttempts } from './callLog';
import type { AttemptLog } from './attempt';

// Every AI call made during a signed-in request counts toward that user's
// daily quota — enforced here so no route can forget to. Outside a request
// (tests, scripts) there's no session and nothing to count.
function requestUserId(): string | null {
  try {
    return getSessionUserId();
  } catch {
    return null;
  }
}

export type AIMessage = GroqMessage | AICreditsMessage; // identical shape

/**
 * Which models to use. "plan" is for rare, high-stakes calls where quality
 * decides whether the learner trusts the product (drafting a syllabus);
 * "content" is for lessons, drills and feedback (frequent, must be correct);
 * "fast" is the cheapest acceptable, for small classification jobs.
 * Each can be overridden with AICREDITS_MODELS_PLAN / _CONTENT / _FAST.
 */
export type AITier = 'plan' | 'content' | 'fast';

const TIER_MODELS: Record<AITier, string[]> = {
  plan: ['google/gemini-3.5-flash', 'anthropic/claude-sonnet-5', 'deepseek/deepseek-v4-flash'],
  content: ['anthropic/claude-haiku-4.5', 'google/gemini-3.5-flash', 'openai/gpt-5.4-mini'],
  fast: ['google/gemini-3.5-flash-lite', 'anthropic/claude-haiku-4.5', 'openai/gpt-4o-mini'],
};

export function modelsForTier(tier: AITier): string[] {
  const env = process.env[`AICREDITS_MODELS_${tier.toUpperCase()}`];
  const fromEnv = env?.split(',').map((m) => m.trim()).filter(Boolean);
  return fromEnv?.length ? fromEnv : TIER_MODELS[tier];
}

export interface AICallOptions {
  temperature?: number;
  jsonMode?: boolean;
  /** Omitted: the legacy default list (AICREDITS_MODELS or gpt-4o-mini first). */
  tier?: AITier;
  maxTokens?: number;
  /** What the call is for ("lesson", "plan.draft"...), so usage can be broken down by feature. */
  purpose?: string;
}

export interface AICallResult {
  content: string;
  provider: 'aicredits' | 'gemini' | 'groq';
}

export interface ProviderFailure {
  provider: string;
  error: string;
}

export class AllAIProvidersFailedError extends Error {
  failures: ProviderFailure[];

  constructor(failures: ProviderFailure[]) {
    super(`All configured AI providers failed: ${failures.map((f) => `${f.provider}: ${f.error}`).join(' | ')}`);
    this.name = 'AllAIProvidersFailedError';
    this.failures = failures;
  }
}

/** True once at least one provider has an API key configured — routes use this instead of checking GROQ_API_KEY alone before deciding whether to show canned fallback content. */
export function hasAnyAIProviderConfigured(): boolean {
  return Boolean(process.env.AICREDITS_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

export async function callAIContent(messages: AIMessage[], options: AICallOptions = {}): Promise<AICallResult> {
  const userId = requestUserId();
  if (userId) await consumeAiQuota(userId);
  await assertWithinDailyBudget();

  const failures: ProviderFailure[] = [];
  const attempts: AttemptLog[] = [];
  const onAttempt = (a: AttemptLog) => { attempts.push(a); };
  const done = () => logAttempts(options.purpose ?? 'other', userId, attempts);

  const aiCreditsKey = process.env.AICREDITS_API_KEY;
  if (aiCreditsKey) {
    try {
      const content = await callAICreditsContent(aiCreditsKey, messages, { ...options, onAttempt, ...(options.tier ? { models: modelsForTier(options.tier) } : {}) });
      await done();
      return { content, provider: 'aicredits' };
    } catch (e) {
      failures.push({ provider: 'aicredits', error: e instanceof AICreditsCallError ? e.message : e instanceof Error ? e.message : String(e) });
    }
  }

  // Google directly (free tier from aistudio.google.com): same models family as
  // the plan tier, so a real quality check works even when AICredits can't.
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const content = await callGeminiContent(geminiKey, messages, { ...options, onAttempt });
      await done();
      return { content, provider: 'gemini' };
    } catch (e) {
      failures.push({ provider: 'gemini', error: e instanceof Error ? e.message : String(e) });
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const content = await callGroqContent(groqKey, messages, { ...options, onAttempt });
      await done();
      return { content, provider: 'groq' };
    } catch (e) {
      failures.push({ provider: 'groq', error: e instanceof GroqCallError ? e.message : e instanceof Error ? e.message : String(e) });
    }
  }

  await done();
  if (failures.length === 0) {
    failures.push({ provider: 'none', error: 'no AI provider API key is configured (AICREDITS_API_KEY / GEMINI_API_KEY / GROQ_API_KEY)' });
  }
  throw new AllAIProvidersFailedError(failures);
}
