/**
 * Single Groq chat-completion client, replacing three near-identical
 * copies that had grown independently in generate-lesson/route.ts,
 * generate-roadmap/route.ts, and socratic/route.ts.
 *
 * All three had the same bug: on a non-ok response, the candidate-model
 * loop silently moved to the next model with no record of why the
 * previous one failed (`if (res.ok) break;` with no `else`). Only a
 * thrown exception (a network error) ever populated `lastErr` — a 400
 * from every single model left `lastErr` null, and the eventual error
 * message was the generic "Groq models failed: API request error" no
 * matter what Groq's actual response said. This client captures each
 * attempt's status and response body, so a bad request, a rate limit,
 * and a genuine outage are distinguishable in the logs instead of all
 * collapsing into the same unhelpful string.
 */

export const GROQ_CANDIDATE_MODELS = ['openai/gpt-oss-120b', 'groq/compound', 'qwen/qwen3.6-27b'] as const;

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqCallOptions {
  temperature?: number;
  jsonMode?: boolean;
  models?: readonly string[];
}

export interface GroqAttempt {
  model: string;
  status?: number;
  detail: string;
}

export class GroqCallError extends Error {
  attempts: GroqAttempt[];

  constructor(attempts: GroqAttempt[]) {
    super(`All Groq candidate models failed: ${attempts.map((a) => `${a.model} (${a.status ?? 'network'}): ${a.detail}`).join('; ')}`);
    this.name = 'GroqCallError';
    this.attempts = attempts;
  }
}

/**
 * Tries each candidate model in order, returning the first successful
 * response's message content. Throws GroqCallError (with every attempt's
 * status/detail) only if all models fail — callers that already show a
 * canned fallback on error get a much more useful console.error for free,
 * since GroqCallError.message lists exactly what each model returned.
 */
export async function callGroqContent(apiKey: string, messages: GroqMessage[], options: GroqCallOptions = {}): Promise<string> {
  const { temperature = 0.3, jsonMode = true, models = GROQ_CANDIDATE_MODELS } = options;
  const attempts: GroqAttempt[] = [];

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

  throw new GroqCallError(attempts);
}
