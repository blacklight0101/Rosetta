import { describe, expect, it } from 'vitest';
import { SystemTimeoutSignals } from '../../../../src/infrastructure/system/system-timeout-signals.js';

// RF-407: the signal of the provider test's time limit comes from the infrastructure.

describe('SystemTimeoutSignals', () => {
  it('RF-407 gives a signal that is not aborted at first and aborts after the delay', async () => {
    const signal = new SystemTimeoutSignals().after(20);
    expect(signal.aborted).toBe(false);

    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        resolve();
      });
    });

    expect(signal.aborted).toBe(true);
  });
});
