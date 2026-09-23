/**
 * OpenRouter chat-completion client — same shape as groqClient.ts
 * (OpenRouter's API is OpenAI-compatible chat completions), kept as a
 * separate small module rather than merged into groqClient.ts so that
 * file's existing shipped tests and behavior stay untouched.
 *
 * Model names need OpenRouter's provider-prefixed slugs (e.g.
 * "openai/gpt-4o-mini"). The defaults below are a reasonable starting
 * list, not a guarantee — override via the `models` option or the
 * OPENROUTER_MODELS env var (comma-separated) if any of these aren't
 * available on your account/credits.
 */

export const OPENROUTER_CANDIDATE_MODELS = (
  process.env.OPENROUTER_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? [
    'openai/gpt-4o-mini',
    'google/gemini-flash-1.5',
    'anthropic/claude-3-haiku',
  ]
) as readonly string[];

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterCallOptions {
  temperature?: number;
  jsonMode?: boolean;
  models?: readonly string[];
}

export interface OpenRouterAttempt {
  model: string;
  status?: number;
  detail: string;
}

export class OpenRouterCallError extends Error {
  attempts: OpenRouterAttempt[];

  constructor(attempts: OpenRouterAttempt[]) {
    super(`All OpenRouter candidate models failed: ${attempts.map((a) => `${a.model} (${a.status ?? 'network'}): ${a.detail}`).join('; ')}`);
    this.name = 'OpenRouterCallError';
    this.attempts = attempts;
  }
}

/**
 * Tries each candidate model in order, returning the first successful
 * response's message content. Throws OpenRouterCallError (every attempt's
 * status/detail included) only if all models fail.
 */
export async function callOpenRouterContent(apiKey: string, messages: OpenRouterMessage[], options: OpenRouterCallOptions = {}): Promise<string> {
  const { temperature = 0.3, jsonMode = true, models = OPENROUTER_CANDIDATE_MODELS } = options;
  const attempts: OpenRouterAttempt[] = [];

  for (const model of models) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Both recommended by OpenRouter's docs to identify the calling
          // app — optional, but cheap to send and helps if you ever need
          // to look up usage on your OpenRouter dashboard.
          'HTTP-Referer': 'https://learning-os.local',
          'X-Title': 'Learning OS',
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

  throw new OpenRouterCallError(attempts);
}
