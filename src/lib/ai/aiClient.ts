/**
 * The single entry point every AI-backed route should call, instead of
 * reaching for groqClient.ts or aiCreditsClient.ts directly. Tries
 * AICredits first (Ravindra's purchased credits at aicredits.in), then
 * falls back to Groq only if every AICredits model failed — per his
 * instruction: "Try AICredits first then as a fallback go to others."
 *
 * Each provider already retries across its own candidate models before
 * giving up (see groqClient.ts / aiCreditsClient.ts) — this module only
 * adds the provider-level fallback on top of that.
 */
import { callGroqContent, GroqCallError, type GroqMessage } from './groqClient';
import { callAICreditsContent, AICreditsCallError, type AICreditsMessage } from './aiCreditsClient';

export type AIMessage = GroqMessage | AICreditsMessage; // identical shape

export interface AICallOptions {
  temperature?: number;
  jsonMode?: boolean;
}

export interface AICallResult {
  content: string;
  provider: 'aicredits' | 'groq';
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
  return Boolean(process.env.AICREDITS_API_KEY || process.env.GROQ_API_KEY);
}

export async function callAIContent(messages: AIMessage[], options: AICallOptions = {}): Promise<AICallResult> {
  const failures: ProviderFailure[] = [];

  const aiCreditsKey = process.env.AICREDITS_API_KEY;
  if (aiCreditsKey) {
    try {
      const content = await callAICreditsContent(aiCreditsKey, messages, options);
      return { content, provider: 'aicredits' };
    } catch (e) {
      failures.push({ provider: 'aicredits', error: e instanceof AICreditsCallError ? e.message : e instanceof Error ? e.message : String(e) });
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const content = await callGroqContent(groqKey, messages, options);
      return { content, provider: 'groq' };
    } catch (e) {
      failures.push({ provider: 'groq', error: e instanceof GroqCallError ? e.message : e instanceof Error ? e.message : String(e) });
    }
  }

  if (failures.length === 0) {
    failures.push({ provider: 'none', error: 'no AI provider API key is configured (AICREDITS_API_KEY / GROQ_API_KEY)' });
  }
  throw new AllAIProvidersFailedError(failures);
}
