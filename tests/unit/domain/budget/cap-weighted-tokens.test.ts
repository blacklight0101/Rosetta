import { describe, expect, it } from 'vitest';
import {
  CACHED_TOKEN_SHARE_PERCENT,
  capWeightedTokens,
} from '../../../../src/domain/budget/token-usage.js';

// RF-422, DEC-168: the tokens a call counts toward a token cap. Cached input counts at a fixed
// tenth; cache writes are input tokens that were not read from the cache, so they count in full.

describe('capWeightedTokens', () => {
  it('RF-422 counts a tenth of the cached input tokens', () => {
    expect(CACHED_TOKEN_SHARE_PERCENT).toBe(10);
    expect(
      capWeightedTokens({ inputTokens: 1200, cachedInputTokens: 1024, outputTokens: 80 }),
    ).toBe(358n);
  });

  it('RF-422 counts input plus output when nothing was cached, as before', () => {
    expect(capWeightedTokens({ inputTokens: 500, cachedInputTokens: 0, outputTokens: 40 })).toBe(
      540n,
    );
  });

  it('RF-422 counts cache write tokens in full', () => {
    expect(
      capWeightedTokens({
        inputTokens: 1000,
        cachedInputTokens: 400,
        cacheWriteInputTokens: 300,
        outputTokens: 0,
      }),
    ).toBe(640n);
  });

  it('RF-422 never counts more cached tokens than the input holds', () => {
    expect(capWeightedTokens({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 5 })).toBe(
      15n,
    );
  });
});
