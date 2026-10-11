import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from '../../../../src/infrastructure/system/system-clock.js';

describe('SystemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('RNF-004 reads the current time from the system', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:05:03.007Z'));

    expect(new SystemClock().now().toISOString()).toBe('2026-10-11T09:05:03.007Z');
  });

  it('RNF-004 returns a new instant on each call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T09:05:03.000Z'));
    const clock = new SystemClock();
    const first = clock.now();
    vi.advanceTimersByTime(1500);

    expect(clock.now().getTime() - first.getTime()).toBe(1500);
  });
});
