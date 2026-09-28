/**
 * What an AI call cost, in rupees. AICredits publishes per-token INR prices
 * on /v1/models (no usage or balance API exists), so the cost of each call
 * is computed from its token counts. The list is fetched at most every 12
 * hours; if it can't be fetched, a small built-in table is used and costs
 * for unknown models stay null (unknown) rather than a guessed zero.
 */

export interface ModelPrice { inPerToken: number; outPerToken: number }

// ₹ per token, from aicredits.in/v1/models on 2026-09-29. Fallback only.
const FALLBACK: Record<string, ModelPrice> = {
  'openai/gpt-4o-mini': { inPerToken: 15e-6, outPerToken: 60e-6 },
  'google/gemini-3.5-flash': { inPerToken: 151e-6, outPerToken: 907e-6 },
  'google/gemini-3.5-flash-lite': { inPerToken: 30e-6, outPerToken: 252e-6 },
  'anthropic/claude-haiku-4.5': { inPerToken: 101e-6, outPerToken: 504e-6 },
  'anthropic/claude-sonnet-5': { inPerToken: 201e-6, outPerToken: 1007e-6 },
  'deepseek/deepseek-v4-flash': { inPerToken: 44e-6, outPerToken: 133e-6 },
  'openai/gpt-5.4-mini': { inPerToken: 76e-6, outPerToken: 453e-6 },
};

const TTL_MS = 12 * 3600_000;
let cache: { at: number; prices: Record<string, ModelPrice> } | null = null;
let inflight: Promise<void> | null = null;

async function refresh(apiKey: string): Promise<void> {
  try {
    const res = await fetch('https://api.aicredits.in/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return;
    const data = (await res.json()) as { data?: Array<{ id: string; input_cost_per_token_inr?: number; output_cost_per_token_inr?: number }> };
    const prices: Record<string, ModelPrice> = {};
    for (const m of data.data ?? []) {
      if (typeof m.input_cost_per_token_inr === 'number' && typeof m.output_cost_per_token_inr === 'number') {
        prices[m.id] = { inPerToken: m.input_cost_per_token_inr, outPerToken: m.output_cost_per_token_inr };
      }
    }
    if (Object.keys(prices).length) cache = { at: Date.now(), prices };
  } catch {
    // Keep whatever we had; the fallback table covers the models we use.
  }
}

export async function priceFor(model: string): Promise<ModelPrice | null> {
  const key = process.env.AICREDITS_API_KEY;
  if (key && (!cache || Date.now() - cache.at > TTL_MS)) {
    inflight ??= refresh(key).finally(() => { inflight = null; });
    await inflight;
  }
  return cache?.prices[model] ?? FALLBACK[model] ?? null;
}

/** ₹ for one call. Reasoning tokens are already inside completion tokens for OpenAI-style usage. */
export function costOf(price: ModelPrice | null, promptTokens: number | null, completionTokens: number | null): number | null {
  if (!price || promptTokens === null || completionTokens === null) return null;
  return promptTokens * price.inPerToken + completionTokens * price.outPerToken;
}
