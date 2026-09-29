/** One request to a provider, as the clients report it for cost logging (see aiClient.ts). */
export interface AttemptLog {
  provider: 'aicredits' | 'gemini' | 'groq' | 'manual';
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  /** A cost the provider itself put in the response, if any (units as reported). */
  reportedCost?: number;
  durationMs: number;
}

/** Token counts from an OpenAI-style response body. */
export function usageOf(data: any): Pick<AttemptLog, 'promptTokens' | 'completionTokens' | 'reasoningTokens' | 'reportedCost'> {
  const u = data?.usage ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    reasoningTokens: num(u.completion_tokens_details?.reasoning_tokens) ?? num(u.reasoning_tokens),
    reportedCost: num(u.cost) ?? num(data?.cost),
  };
}
