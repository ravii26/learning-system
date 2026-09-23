import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callOpenRouterContent, OpenRouterCallError } from './openRouterClient';

describe('callOpenRouterContent', () => {
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

    const content = await callOpenRouterContent('key', [{ role: 'user', content: 'hi' }], { models: ['a'] });
    expect(content).toBe('{"ok":true}');
  });

  it('sends the OpenRouter endpoint, auth header, and identifying headers', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    await callOpenRouterContent('secret-key', [{ role: 'user', content: 'hi' }], { models: ['a'] });

    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    expect(init.headers['HTTP-Referer']).toBeTruthy();
    expect(init.headers['X-Title']).toBeTruthy();
  });

  it('falls through to the next model on a non-ok response', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => 'insufficient credits', statusText: 'Payment Required' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'second model' } }] }) });

    const content = await callOpenRouterContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
    expect(content).toBe('second model');
  });

  it('throws OpenRouterCallError with every attempt captured when all models fail', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 402, text: async () => 'insufficient credits', statusText: 'Payment Required' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'model not found', statusText: 'Not Found' });

    try {
      await callOpenRouterContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(OpenRouterCallError);
      const err = e as OpenRouterCallError;
      expect(err.attempts).toEqual([
        { model: 'a', status: 402, detail: 'insufficient credits' },
        { model: 'b', status: 404, detail: 'model not found' },
      ]);
    }
  });
});
