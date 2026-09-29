import { describe, expect, it } from 'vitest';
import { costOf } from './pricing';
import { usageOf } from './attempt';

describe('AI cost logging', () => {
  it('prices a call from its token counts', () => {
    // Gemini 3.5 Flash: ₹151 per million in, ₹907 per million out.
    const price = { inPerToken: 151e-6, outPerToken: 907e-6 };
    expect(costOf(price, 1265, 3960)).toBeCloseTo(0.191 + 3.592, 2);
  });
  it('is unknown (null), never zero, without a price or token counts', () => {
    expect(costOf(null, 100, 100)).toBeNull();
    expect(costOf({ inPerToken: 1, outPerToken: 1 }, null, 100)).toBeNull();
  });
  it('reads OpenAI-style usage, including hidden reasoning tokens and a reported cost', () => {
    expect(usageOf({ usage: { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 12 }, cost: 0.004 } }))
      .toEqual({ promptTokens: 10, completionTokens: 20, reasoningTokens: 12, reportedCost: 0.004 });
    expect(usageOf({})).toEqual({ promptTokens: undefined, completionTokens: undefined, reasoningTokens: undefined, reportedCost: undefined });
  });
});
