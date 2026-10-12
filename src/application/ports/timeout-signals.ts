// RF-407: a cancel signal that fires after a delay. The timer is the infrastructure's, so the
// application layer reads no clock of its own (conventions: determinism ports).
export interface TimeoutSignals {
  /** A signal that aborts after `milliseconds`. */
  after(milliseconds: number): AbortSignal;
}
