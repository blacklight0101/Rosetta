import type { TimeoutSignals } from '../../application/ports/timeout-signals.js';

// RF-407
export class SystemTimeoutSignals implements TimeoutSignals {
  after(milliseconds: number): AbortSignal {
    return AbortSignal.timeout(milliseconds);
  }
}
