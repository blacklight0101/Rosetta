import { describe, expect, it, vi } from 'vitest';
import { ReaderRoom } from '../../../../src/application/understand/reader-room.js';

// RF-429, RF-432, P8-03: when the run cap the readers are held to is the amount the owner approved,
// the readers' stop pauses the run and asks, as a refused call does; with a plain cap it only stops
// the readers and the run ends as before.

const spend = { tokens: 95_000n, micros: 0n };
const limits = { runTokens: 100_000n, runMicros: 0n, callTokens: 10_000n };

function roomWith(pause: (() => void) | undefined): ReaderRoom {
  return new ReaderRoom(
    {
      spend: () => spend,
      runSpend: () => spend,
      stoppedAtLine: () => false,
      announce: () => Promise.resolve(),
      ...(pause === undefined ? {} : { pause }),
    },
    limits,
  );
}

describe('RF-432 the readers stop at an approved line', () => {
  it('RF-432 P8-03 the stop asks the run to pause when the cap is the approved amount', async () => {
    const pause = vi.fn();

    const admitted = await roomWith(pause).admits();

    expect(admitted).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('RF-429 the stop at a plain cap does not pause the run', async () => {
    const room = roomWith(undefined);

    expect(await room.admits()).toBe(false);
    expect(room.reason).toBeDefined();
  });
});
