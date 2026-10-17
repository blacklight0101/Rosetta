import { describe, expect, it } from 'vitest';
import { needsConfirmation } from '../../../web/src/lib/start-confirmation.js';

// RF-425, DEC-97: when the start page asks before an expensive run.

const ask = (likely: bigint | undefined, threshold: bigint, confirmed = 0n): boolean =>
  needsConfirmation({
    likelyMicros: likely,
    thresholdMicros: threshold,
    confirmedMicros: confirmed,
  });

describe('needsConfirmation', () => {
  it('RF-425 asks only when the likely cost is above the threshold', () => {
    expect(ask(250_001n, 250_000n)).toBe(true);
    expect(ask(250_000n, 250_000n)).toBe(false);
    expect(ask(10n, 250_000n)).toBe(false);
  });

  it('RF-425 a threshold of zero asks for a run that costs something, not for one that costs nothing', () => {
    expect(ask(1n, 0n)).toBe(true);
    expect(ask(0n, 0n)).toBe(false);
  });

  it('RF-425 does not ask again for a figure already confirmed, nor a lower one, but does for a higher one', () => {
    expect(ask(390_000n, 250_000n, 390_000n)).toBe(false);
    expect(ask(300_000n, 250_000n, 390_000n)).toBe(false);
    expect(ask(390_001n, 250_000n, 390_000n)).toBe(true);
  });

  it('RF-425 has nothing to ask about without an estimate', () => {
    expect(ask(undefined, 0n)).toBe(false);
  });
});
