/**
 * Google Gemini through its OpenAI-compatible endpoint
 * (generativelanguage.googleapis.com/v1beta/openai), with a key from
 * aistudio.google.com. Same request/response shape as the other two
 * clients. Google's free tier has per-minute and per-day limits (a 429 when
 * reached) and, on the free tier, Google may use prompts to improve its
 * products, so it suits testing and backup more than primary production use.
 */
import { usageOf, type AttemptLog } from './attempt';

const URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const RETRY_MS = 2500;
/**
 * A request with no reply after this long is abandoned for the next model.
 * Generous on purpose: a long lesson legitimately takes 50+ s, and an
 * abandoned request may still be billed on a paid key. It only catches a
 * model that is truly stuck. The last model in the list is never cut off.
 */
export const ATTEMPT_TIMEOUT_MS = 75_000;
/** How long to skip a model after it said "quota used up" (429) or stayed overloaded (503/timeout). */
export const COOLDOWN_MS = { quota: 15 * 60_000, busy: 2 * 60_000 };

// Per server instance: models that just failed that way are skipped until then,
// so the next lesson doesn't wait 40 s on the same busy model again.
const coolingUntil = new Map<string, number>();
export function resetGeminiCooldowns() { coolingUntil.clear(); }

export type GeminiTier = 'plan' | 'content' | 'fast';

/** Per tier, tried in order. Override with GEMINI_MODELS_PLAN / _CONTENT / _FAST (comma-separated). */
// Checked with a free AI Studio key on 2026-09-29: the 2.5 models are closed
// to new users; 3.8-flash exists but was overloaded (503) at the time.
const DEFAULTS: Record<GeminiTier, string[]> = {
  plan: ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
  content: ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
  fast: ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
};

export function geminiModels(tier: GeminiTier | undefined): string[] {
  const t = tier ?? 'content';
  const env = process.env[`GEMINI_MODELS_${t.toUpperCase()}`]?.split(',').map((m) => m.trim()).filter(Boolean);
  return env?.length ? env : DEFAULTS[t];
}

export interface GeminiMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface GeminiCallOptions {
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
  tier?: GeminiTier;
  onAttempt?: (a: AttemptLog) => void;
}

export class GeminiCallError extends Error {
  constructor(public attempts: { model: string; status?: number; detail: string }[]) {
    super(`All Gemini models failed: ${attempts.map((a) => `${a.model} (${a.status ?? 'network'}): ${a.detail}`).join('; ')}`);
    this.name = 'GeminiCallError';
  }
}

export async function callGeminiContent(apiKey: string, messages: GeminiMessage[], options: GeminiCallOptions = {}): Promise<string> {
  const { temperature = 0.3, jsonMode = true, maxTokens, tier, onAttempt } = options;
  const attempts: { model: string; status?: number; detail: string }[] = [];

  const all = geminiModels(tier);
  const ready = all.filter((m) => (coolingUntil.get(m) ?? 0) <= Date.now());
  // If every model is cooling down, still try them rather than fail without asking.
  const models = ready.length ? ready : all;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const t0 = Date.now();
    const timeout = new AbortController();
    const last = i === models.length - 1;
    const timer = last ? undefined : setTimeout(() => timeout.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(URL, {
        signal: timeout.signal,
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content: string | undefined = data.choices?.[0]?.message?.content;
        const log = (ok: boolean, error?: string) => onAttempt?.({ provider: 'gemini', model, ok, status: res.status, error, ...usageOf(data), durationMs: Date.now() - t0 });
        if (content && data.choices?.[0]?.finish_reason === 'length' && jsonMode) {
          log(false, 'cut off at the length limit');
          attempts.push({ model, status: res.status, detail: 'reply was cut off at the length limit' });
          continue;
        }
        log(!!content, content ? undefined : 'no message content');
        if (content) return content;
        attempts.push({ model, status: res.status, detail: 'response had no message content' });
        continue;
      }
      const body = (await res.text().catch(() => '')).slice(0, 300) || res.statusText;
      onAttempt?.({ provider: 'gemini', model, ok: false, status: res.status, error: body, durationMs: Date.now() - t0 });
      attempts.push({ model, status: res.status, detail: body });
      if (res.status === 429) coolingUntil.set(model, Date.now() + COOLDOWN_MS.quota);
      // A quick "high demand" (503) usually clears in seconds: one retry. A slow one means it's
      // properly overloaded: rest it and move on.
      if (res.status === 503) {
        const quick = Date.now() - t0 < 5_000;
        if (quick && attempts.filter((a) => a.model === model).length === 1) {
          await new Promise((r) => setTimeout(r, RETRY_MS));
          i--;
        } else coolingUntil.set(model, Date.now() + COOLDOWN_MS.busy);
      }
    } catch (e) {
      if (timeout.signal.aborted) coolingUntil.set(model, Date.now() + COOLDOWN_MS.busy);
      const detail = timeout.signal.aborted ? `no reply within ${ATTEMPT_TIMEOUT_MS / 1000} s` : (e instanceof Error ? e.message : String(e)).slice(0, 300);
      onAttempt?.({ provider: 'gemini', model, ok: false, error: detail, durationMs: Date.now() - t0 });
      attempts.push({ model, detail });
    } finally {
      clearTimeout(timer);
    }
  }
  throw new GeminiCallError(attempts);
}
