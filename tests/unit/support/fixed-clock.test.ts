import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../support/fixed-clock.js';

describe('FixedClock', () => {
  it('RNF-004 always returns the configured instant', () => {
    const clock = new FixedClock('2026-10-11T09:05:03.007Z');

    expect(clock.now().toISOString()).toBe('2026-10-11T09:05:03.007Z');
    expect(clock.now().toISOString()).toBe('2026-10-11T09:05:03.007Z');
  });

  it('RNF-004 moves only when advanced or set', () => {
    const clock = new FixedClock('2026-10-11T09:05:03.000Z');
    clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-10-11T09:05:04.500Z');
    clock.set('2027-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('RNF-004 hands out copies so callers cannot move the clock', () => {
    const clock = new FixedClock('2026-10-11T09:05:03.000Z');
    clock.now().setUTCFullYear(1999);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
