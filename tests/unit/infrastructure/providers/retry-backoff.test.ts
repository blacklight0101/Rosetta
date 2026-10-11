import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  retryAfterMs,
  retryHintMs,
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

  it.each([[null], [''], ['soon'], ['-3'], ['Wed, 31 Feb 2026 07:28:00 GMT']])(
    'RF-406 %s is not a usable hint',
    (header) => {
      expect(retryAfterMs(header)).toBeUndefined();
    },
  );
});

describe('retry-after HTTP date', () => {
  const now = Date.parse('2026-10-21T07:00:00Z');

  it.each([
    ['Wed, 21 Oct 2026 07:00:30 GMT', 30_000],
    ['Wed, 21 Oct 2026 06:00:00 GMT', 0],
    ['Wed, 21 Oct 2026 09:00:00 GMT', 300_000],
  ])(
    'RF-406 the date %s is read as %i ms from now (capped at five minutes)',
    (header, expected) => {
      expect(retryAfterMs(header, now)).toBe(expected);
    },
  );

  it('RF-406 a date in the retry hint headers is used when no seconds are given', () => {
    const headers = new Headers({ 'retry-after': 'Wed, 21 Oct 2026 07:00:10 GMT' });

    expect(retryHintMs(headers, now)).toBe(10_000);
  });
});

describe('retry hint headers', () => {
  it.each([
    [{ 'retry-after-ms': '2500', 'retry-after': '3' }, 2500],
    [{ 'retry-after': '3' }, 3000],
    [{ 'retry-after-ms': 'soon', 'retry-after': '3' }, 3000],
    [{ 'retry-after-ms': '1234567890' }, undefined],
    [{}, undefined],
  ])('RF-406 %o gives a hint of %s ms', (headers, expected) => {
    expect(retryHintMs(new Headers(headers))).toBe(expected);
  });
});
