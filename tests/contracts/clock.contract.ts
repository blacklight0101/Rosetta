import { describe, expect, it } from 'vitest';
import type { Clock } from '../../src/application/ports/clock.js';

/** Contract of the Clock port (RNF-004): every adapter and fake must pass it. */
export function clockContract(name: string, create: () => Clock): void {
  describe(`Clock contract: ${name}`, () => {
    it('RNF-004 returns a valid instant', () => {
      expect(Number.isNaN(create().now().getTime())).toBe(false);
    });

    it('RNF-004 never goes backwards between two reads', () => {
      const clock = create();
      const first = clock.now().getTime();

      expect(clock.now().getTime()).toBeGreaterThanOrEqual(first);
    });

    it('RNF-004 hands out a copy, so changing it does not change the clock', () => {
      const clock = create();
      const before = clock.now().getTime();
      clock.now().setUTCFullYear(1999);

      expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);
    });
  });
}
