import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idleSignal } from '../../../../src/infrastructure/providers/idle-signal.js';
import {
  firstTokenWaitMs,
  FREE_PROMPT_TOKENS,
  MAX_WAIT_MS,
} from '../../../../src/infrastructure/providers/prompt-wait.js';

// RF-406, RF-401, P3-113, EV-29: the wait for the first token of a call grows with the prompt, since
// a local model reads a 138,000-token prompt for minutes before it answers; the idle time between
// tokens that follow is the setting as it was.

describe('firstTokenWaitMs', () => {
  it('RF-406 leaves the setting alone for a prompt up to the free size', () => {
    expect(firstTokenWaitMs(120_000, 100)).toBe(120_000);
    expect(firstTokenWaitMs(120_000, FREE_PROMPT_TOKENS)).toBe(120_000);
  });

  it('P3-113 gives a long prompt a longer wait than a short one, growing with its size', () => {
    const short = firstTokenWaitMs(120_000, 20_000);
    const long = firstTokenWaitMs(120_000, 138_000);
    const longer = firstTokenWaitMs(120_000, 149_000);

    expect(short).toBeGreaterThan(120_000);
    expect(long).toBeGreaterThan(short);
    expect(longer).toBeGreaterThan(long);
    // The 138,000-token first call of the evaluation needed more than ten minutes on a local model.
    expect(long).toBeGreaterThanOrEqual(600_000);
  });

  it('P3-113 never waits longer than the ceiling', () => {
    expect(firstTokenWaitMs(120_000, 5_000_000)).toBe(MAX_WAIT_MS);
    expect(firstTokenWaitMs(MAX_WAIT_MS + 1, 100)).toBe(MAX_WAIT_MS + 1);
  });
});

describe('idleSignal with a first wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('P3-113 waits the first wait for the first sign of life, then the idle time', () => {
    const idle = idleSignal(new AbortController().signal, 1_000, 5_000);

    vi.advanceTimersByTime(4_999);
    expect(idle.signal.aborted).toBe(false);
    idle.touch();
    vi.advanceTimersByTime(999);
    expect(idle.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);

    expect(idle.timedOut()).toBe(true);
  });

  it('P3-113 times out at the first wait when nothing arrives', () => {
    const idle = idleSignal(new AbortController().signal, 1_000, 5_000);

    vi.advanceTimersByTime(5_000);

    expect(idle.timedOut()).toBe(true);
  });
});
