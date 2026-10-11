import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  retryAfterMs,
} from '../../../../src/infrastructure/providers/retry-backoff.js';

// RF-406: exponential back-off with jitter, honouring any retry-after hint.

describe('back-off delay', () => {
  it.each([
    [1, 0, 500],
    [1, 1, 1000],
    [2, 0.5, 1500],
    [3, 1, 4000],
    [10, 1, 30000],
  ])('RF-406 retry %i with jitter %d waits %i ms', (retry, random, expected) => {
    expect(backoffDelayMs({ retry, random })).toBe(expected);
  });

  it('RF-406 waits at least the retry-after hint', () => {
    expect(backoffDelayMs({ retry: 1, random: 0, retryAfterMs: 7000 })).toBe(7000);
  });

  it('RF-406 a retry-after shorter than the back-off does not shorten it', () => {
    expect(backoffDelayMs({ retry: 3, random: 1, retryAfterMs: 1000 })).toBe(4000);
  });

  it('RF-406 a retry-after hint is capped at five minutes', () => {
    expect(backoffDelayMs({ retry: 1, random: 0, retryAfterMs: 3_600_000 })).toBe(300_000);
  });
});

describe('retry-after header', () => {
  it.each([
    ['7', 7000],
    ['0', 0],
    [' 12 ', 12000],
  ])('RF-406 %s seconds is read as %i ms', (header, expected) => {
    expect(retryAfterMs(header)).toBe(expected);
  });

  it.each([[null], [''], ['soon'], ['Wed, 21 Oct 2026 07:28:00 GMT'], ['-3']])(
    'RF-406 %s is not a usable hint',
    (header) => {
      expect(retryAfterMs(header)).toBeUndefined();
    },
  );
});
