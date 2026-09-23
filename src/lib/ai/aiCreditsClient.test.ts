import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callAICreditsContent, AICreditsCallError } from './aiCreditsClient';

describe('callAICreditsContent', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns the first successful model response content', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    });

    const content = await callAICreditsContent('key', [{ role: 'user', content: 'hi' }], { models: ['a'] });
    expect(content).toBe('{"ok":true}');
  });

  it('sends the AICredits endpoint and Bearer auth header', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    await callAICreditsContent('sk-secret', [{ role: 'user', content: 'hi' }], { models: ['a'] });

    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://api.aicredits.in/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-secret');
  });

  it('falls through to the next model on a non-ok response', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => '{"error":{"message":"insufficient balance","type":"insufficient_quota","code":402}}', statusText: 'Payment Required' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'second model' } }] }) });

    const content = await callAICreditsContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
    expect(content).toBe('second model');
  });

  it('throws AICreditsCallError with every attempt captured when all models fail', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => 'insufficient balance', statusText: 'Payment Required' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'model not found', statusText: 'Not Found' });

    try {
      await callAICreditsContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AICreditsCallError);
      const err = e as AICreditsCallError;
      expect(err.attempts).toEqual([
        { model: 'a', status: 402, detail: 'insufficient balance' },
        { model: 'b', status: 404, detail: 'model not found' },
      ]);
    }
  });
});
