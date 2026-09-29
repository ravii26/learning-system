import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGeminiContent, geminiModels, resetGeminiCooldowns } from './geminiClient';

const reply = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (content: string) => reply(200, { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 3 } });

describe('callGeminiContent', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); resetGeminiCooldowns(); });

  it('retries the same model once on 503, then succeeds', async () => {
    vi.useFakeTimers();
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(503, 'high demand'))
      .mockResolvedValueOnce(ok('{"a":1}'));
    const logs: string[] = [];
    const p = callGeminiContent('k', [{ role: 'user', content: 'hi' }], { tier: 'plan', onAttempt: (a) => logs.push(`${a.model}:${a.ok}`) });
    await vi.runAllTimersAsync();
    expect(await p).toBe('{"a":1}');
    const models = f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).model);
    expect(models).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash']);
    expect(logs).toEqual(['gemini-3.5-flash:false', 'gemini-3.5-flash:true']);
  });

  it('moves to the next model on 429 (free-tier limit) without waiting', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(429, 'quota'))
      .mockResolvedValueOnce(ok('{}'));
    expect(await callGeminiContent('k', [{ role: 'user', content: 'hi' }], { tier: 'plan' })).toBe('{}');
    expect(JSON.parse(String((f.mock.calls[1][1] as RequestInit).body)).model).toBe(geminiModels('plan')[1]);
  });

  it('skips a model whose free quota ran out on the next call', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(429, 'quota'))
      .mockResolvedValueOnce(ok('{}'))
      .mockResolvedValueOnce(ok('{}'));
    await callGeminiContent('k', [{ role: 'user', content: 'a' }], { tier: 'plan' });
    await callGeminiContent('k', [{ role: 'user', content: 'b' }], { tier: 'plan' });
    const models = f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).model);
    expect(models).toEqual([geminiModels('plan')[0], geminiModels('plan')[1], geminiModels('plan')[1]]);
  });
});
