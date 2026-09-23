import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callAIContent, hasAnyAIProviderConfigured, AllAIProvidersFailedError } from './aiClient';
import * as groqClient from './groqClient';
import * as openRouterClient from './openRouterClient';

describe('callAIContent', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('tries OpenRouter first when both keys are configured', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.GROQ_API_KEY = 'groq-key';
    const orSpy = vi.spyOn(openRouterClient, 'callOpenRouterContent').mockResolvedValue('from openrouter');
    const groqSpy = vi.spyOn(groqClient, 'callGroqContent').mockResolvedValue('from groq');

    const result = await callAIContent([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ content: 'from openrouter', provider: 'openrouter' });
    expect(orSpy).toHaveBeenCalledTimes(1);
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('falls back to Groq when OpenRouter fails entirely', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.GROQ_API_KEY = 'groq-key';
    vi.spyOn(openRouterClient, 'callOpenRouterContent').mockRejectedValue(new openRouterClient.OpenRouterCallError([{ model: 'a', status: 402, detail: 'no credits' }]));
    vi.spyOn(groqClient, 'callGroqContent').mockResolvedValue('rescued by groq');

    const result = await callAIContent([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ content: 'rescued by groq', provider: 'groq' });
  });

  it('skips OpenRouter entirely when no OPENROUTER_API_KEY is set, going straight to Groq', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.GROQ_API_KEY = 'groq-key';
    const orSpy = vi.spyOn(openRouterClient, 'callOpenRouterContent');
    vi.spyOn(groqClient, 'callGroqContent').mockResolvedValue('from groq');

    const result = await callAIContent([{ role: 'user', content: 'hi' }]);
    expect(result).toEqual({ content: 'from groq', provider: 'groq' });
    expect(orSpy).not.toHaveBeenCalled();
  });

  it('skips Groq when no GROQ_API_KEY is set and OpenRouter already succeeded', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    delete process.env.GROQ_API_KEY;
    vi.spyOn(openRouterClient, 'callOpenRouterContent').mockResolvedValue('from openrouter');
    const groqSpy = vi.spyOn(groqClient, 'callGroqContent');

    await callAIContent([{ role: 'user', content: 'hi' }]);
    expect(groqSpy).not.toHaveBeenCalled();
  });

  it('throws AllAIProvidersFailedError with both failures when every configured provider fails', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.GROQ_API_KEY = 'groq-key';
    vi.spyOn(openRouterClient, 'callOpenRouterContent').mockRejectedValue(new openRouterClient.OpenRouterCallError([{ model: 'a', status: 402, detail: 'no credits' }]));
    vi.spyOn(groqClient, 'callGroqContent').mockRejectedValue(new groqClient.GroqCallError([{ model: 'b', status: 429, detail: 'rate limited' }]));

    try {
      await callAIContent([{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AllAIProvidersFailedError);
      const err = e as AllAIProvidersFailedError;
      expect(err.failures).toHaveLength(2);
      expect(err.failures[0].provider).toBe('openrouter');
      expect(err.failures[1].provider).toBe('groq');
      expect(err.message).toContain('no credits');
      expect(err.message).toContain('rate limited');
    }
  });

  it('throws with a clear "none configured" failure when neither key is set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      await callAIContent([{ role: 'user', content: 'hi' }]);
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as AllAIProvidersFailedError;
      expect(err.failures).toEqual([{ provider: 'none', error: expect.stringContaining('no AI provider API key') }]);
    }
  });
});

describe('hasAnyAIProviderConfigured', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('is true when only OPENROUTER_API_KEY is set', () => {
    delete process.env.GROQ_API_KEY;
    process.env.OPENROUTER_API_KEY = 'x';
    expect(hasAnyAIProviderConfigured()).toBe(true);
  });

  it('is true when only GROQ_API_KEY is set', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.GROQ_API_KEY = 'x';
    expect(hasAnyAIProviderConfigured()).toBe(true);
  });

  it('is false when neither is set', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
    expect(hasAnyAIProviderConfigured()).toBe(false);
  });
});
