import { describe, expect, it } from 'vitest';
import { reservationLifetimeMs } from '../../../../src/infrastructure/providers/reservation-lifetime.js';
import { backoffDelayMs } from '../../../../src/infrastructure/providers/retry-backoff.js';

// RF-422, DEC-112, P1-27 note: a reservation must outlive the call it guards: every attempt's
// timeout, every wait between attempts and a margin, so the worst case never stops counting while
// the call can still spend.

const second = 1000;
const hintLimit = 300 * second;

describe('reservationLifetimeMs', () => {
  it('RF-422 covers every attempt, every back-off wait at its longest and a margin', () => {
    const maxRetries = 3;
    const longestWaits = [1, 2, 3].map((retry) =>
      backoffDelayMs({ retry, random: 0.999999, retryAfterMs: hintLimit }),
    );

    const lifetime = reservationLifetimeMs({ kind: 'openai', timeoutSeconds: 120, maxRetries });

    const needed = 120 * second * (maxRetries + 1) + longestWaits.reduce((a, b) => a + b, 0);
    expect(lifetime - needed).toBeGreaterThanOrEqual(60 * second);
  });

  it('RF-422 grows with the timeout and with the retries', () => {
    const base = reservationLifetimeMs({ kind: 'openai', timeoutSeconds: 60, maxRetries: 2 });

    const slower = reservationLifetimeMs({ kind: 'openai', timeoutSeconds: 90, maxRetries: 2 });
    const more = reservationLifetimeMs({ kind: 'openai', timeoutSeconds: 60, maxRetries: 3 });

    expect(slower).toBeGreaterThan(base);
    expect(more).toBeGreaterThan(base);
  });

  it('RF-422 allows an Ollama attempt its digest, context and chat requests', () => {
    const ollama = reservationLifetimeMs({ kind: 'ollama', timeoutSeconds: 120, maxRetries: 0 });

    expect(ollama).toBeGreaterThanOrEqual(3 * 120 * second);
  });

  it('RF-422 is a whole number of at least a minute and the timeout for no retries at all', () => {
    const lifetime = reservationLifetimeMs({ kind: 'openai', timeoutSeconds: 1, maxRetries: 0 });

    expect(Number.isInteger(lifetime)).toBe(true);
    expect(lifetime).toBeGreaterThanOrEqual(61 * second);
  });
});
