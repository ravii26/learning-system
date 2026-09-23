/**
 * AICredits (https://aicredits.in) chat-completion client — same shape as
 * groqClient.ts (AICredits is an OpenAI-compatible gateway over 300+
 * models with INR billing), kept as a separate small module rather than
 * merged into groqClient.ts so that file's existing shipped tests and
 * behavior stay untouched.
 *
 * Confirmed against https://aicredits.in/docs (quickstart + api-reference,
 * fetched 2026-09-23) — not guessed: base URL, Bearer auth, request/
 * response shape (identical to OpenAI chat completions,
 * choices[0].message.content), and error shape ({error:{message,type,
 * code}}).
 *
 * Model names need AICredits' provider-prefixed IDs (e.g.
 * "openai/gpt-4o-mini"). The defaults below are real IDs listed on
 * https://aicredits.in/models as budget-friendly/general-purpose, not a
 * guarantee they're enabled for any given account — override via the
 * `models` option or the AICREDITS_MODELS env var (comma-separated).
 */

export const AICREDITS_CANDIDATE_MODELS = (
  process.env.AICREDITS_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? [
    'openai/gpt-4o-mini',
    'anthropic/claude-3-haiku',
    'google/gemini-2.5-flash-lite',
  ]
) as readonly string[];

export interface AICreditsMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICreditsCallOptions {
  temperature?: number;
  jsonMode?: boolean;
  models?: readonly string[];
}

export interface AICreditsAttempt {
  model: string;
  status?: number;
  detail: string;
}

export class AICreditsCallError extends Error {
  attempts: AICreditsAttempt[];

  constructor(attempts: AICreditsAttempt[]) {
    super(`All AICredits candidate models failed: ${attempts.map((a) => `${a.model} (${a.status ?? 'network'}): ${a.detail}`).join('; ')}`);
    this.name = 'AICreditsCallError';
    this.attempts = attempts;
  }
}

/**
 * Tries each candidate model in order, returning the first successful
 * response's message content. Throws AICreditsCallError (every attempt's
 * status/detail included) only if all models fail.
 */
export async function callAICreditsContent(apiKey: string, messages: AICreditsMessage[], options: AICreditsCallOptions = {}): Promise<string> {
  const { temperature = 0.3, jsonMode = true, models = AICREDITS_CANDIDATE_MODELS } = options;
  const attempts: AICreditsAttempt[] = [];

  for (const model of models) {
    try {
      const res = await fetch('https://api.aicredits.in/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          response_format: jsonMode ? { type: 'json_object' } : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
        attempts.push({ model, status: res.status, detail: 'response had no message content' });
        continue;
      }

      const bodyText = await res.text().catch(() => '');
      attempts.push({ model, status: res.status, detail: bodyText.slice(0, 300) || res.statusText });
    } catch (e) {
      attempts.push({ model, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  throw new AICreditsCallError(attempts);
}
