import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idleSignal } from '../../../../src/infrastructure/providers/idle-signal.js';

// RF-406, Q-60: the timeout of one attempt counts the time since the last sign of life.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('idleSignal', () => {
  it('Q-60 aborts when the idle time passes without a touch', () => {
    const idle = idleSignal(new AbortController().signal, 1_000);

    vi.advanceTimersByTime(999);
    expect(idle.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);

    expect(idle.signal.aborted).toBe(true);
    expect(idle.timedOut()).toBe(true);
  });

  it('Q-60 starts the idle time again at every touch', () => {
    const idle = idleSignal(new AbortController().signal, 1_000);

    for (let second = 0; second < 5; second += 1) {
      vi.advanceTimersByTime(900);
      idle.touch();
    }

    expect(idle.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(idle.timedOut()).toBe(true);
  });

  it('Q-60 leaves no timer running once the attempt is over', () => {
    const idle = idleSignal(new AbortController().signal, 1_000);

    idle.stop();
    vi.advanceTimersByTime(5_000);

    expect(idle.signal.aborted).toBe(false);
    expect(idle.timedOut()).toBe(false);
  });

  it('RF-406 does not call the abort of the caller a timeout', () => {
    const caller = new AbortController();
    const idle = idleSignal(caller.signal, 1_000);

    caller.abort();
    vi.advanceTimersByTime(2_000);

    expect(idle.signal.aborted).toBe(true);
    expect(idle.timedOut()).toBe(false);
  });
});
