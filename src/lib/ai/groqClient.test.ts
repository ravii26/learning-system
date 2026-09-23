import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callGroqContent, GroqCallError } from './groqClient';

describe('callGroqContent', () => {
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

    const content = await callGroqContent('key', [{ role: 'user', content: 'hi' }]);
    expect(content).toBe('{"ok":true}');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next model on a non-ok response', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad request', statusText: 'Bad Request' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'second model' } }] }) });

    const content = await callGroqContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
    expect(content).toBe('second model');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('falls through to the next model on a network exception', async () => {
    (global.fetch as any)
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'recovered' } }] }) });

    const content = await callGroqContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
    expect(content).toBe('recovered');
  });

  it('throws GroqCallError with every attempt captured when all models fail', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'invalid schema', statusText: 'Bad Request' })
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited', statusText: 'Too Many Requests' });

    try {
      await callGroqContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GroqCallError);
      const err = e as GroqCallError;
      expect(err.attempts).toEqual([
        { model: 'a', status: 400, detail: 'invalid schema' },
        { model: 'b', status: 429, detail: 'rate limited' },
      ]);
      // The whole point of the fix: a 400 must be distinguishable from a
      // generic failure, not collapsed into "API request error".
      expect(err.message).toContain('400');
      expect(err.message).toContain('invalid schema');
    }
  });

  it('records a network exception with no status, distinct from an HTTP failure', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('fetch failed: ENOTFOUND'));

    try {
      await callGroqContent('key', [{ role: 'user', content: 'hi' }], { models: ['a'] });
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as GroqCallError;
      expect(err.attempts).toEqual([{ model: 'a', detail: 'fetch failed: ENOTFOUND' }]);
      expect(err.attempts[0].status).toBeUndefined();
    }
  });

  it('treats a response with no message content as a failed attempt, not a crash', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: {} }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'fallback model' } }] }) });

    const content = await callGroqContent('key', [{ role: 'user', content: 'hi' }], { models: ['a', 'b'] });
    expect(content).toBe('fallback model');
  });

  it('sends the requested temperature and jsonMode through to the request body', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    await callGroqContent('key', [{ role: 'user', content: 'hi' }], { temperature: 0.7, jsonMode: false, models: ['a'] });

    const [, init] = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.temperature).toBe(0.7);
    expect(body.response_format).toBeUndefined();
  });
});
