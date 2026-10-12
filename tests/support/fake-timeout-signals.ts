import type { TimeoutSignals } from '../../src/application/ports/timeout-signals.js';

// RF-407: a TimeoutSignals port that never fires by itself; the test aborts the signals it wants.

export class FakeTimeoutSignals implements TimeoutSignals {
  /** The delay each issued signal was asked for, in order. */
  readonly delays: number[] = [];
  /** The controllers of the issued signals, in order. */
  readonly controllers: AbortController[] = [];

  after(milliseconds: number): AbortSignal {
    this.delays.push(milliseconds);
    const controller = new AbortController();
    this.controllers.push(controller);
    return controller.signal;
  }
}
