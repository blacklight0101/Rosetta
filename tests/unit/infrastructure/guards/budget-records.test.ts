import { describe, expect, it } from 'vitest';
import type { TokenUsage } from '../../../../src/application/ports/llm-provider.js';
import { withEarlier } from '../../../../src/infrastructure/guards/budget-records.js';

// RF-428, Q-60: the usage of a call's retried attempts is added to its closing usage; the sum is an
// estimate only when one of its parts is.

const reported: TokenUsage = {
  inputTokens: 100,
  outputTokens: 10,
  cachedInputTokens: 0,
  usageSource: 'reported',
};
const estimated: TokenUsage = { ...reported, inputTokens: 5000, usageSource: 'estimated' };

describe('withEarlier', () => {
  it('RF-428 sums every attempt and stays reported when every part was reported', () => {
    expect(withEarlier(reported, [reported, reported])).toEqual({
      inputTokens: 300,
      outputTokens: 30,
      cachedInputTokens: 0,
      usageSource: 'reported',
    });
  });

  it('RF-428 marks the sum estimated when an earlier attempt was estimated', () => {
    expect(withEarlier(reported, [estimated])).toMatchObject({
      inputTokens: 5100,
      usageSource: 'estimated',
    });
  });

  it('RF-428 marks the sum estimated when the closing attempt was estimated', () => {
    expect(withEarlier(estimated, [reported])).toMatchObject({ usageSource: 'estimated' });
  });

  it('RF-428 returns the closing usage as it is when nothing came earlier', () => {
    expect(withEarlier(reported, [])).toBe(reported);
  });
});
