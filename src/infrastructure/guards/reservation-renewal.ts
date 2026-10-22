// RF-422, ADR-007, P3-99: keeps the reservation of a call in flight counting. A streamed answer
// can run longer than its timeout x attempts (the timeout counts only idle time, Q-60), so its
// first expiry is not the end of the call. While the call runs, `renew` is run every `everyMs`;
// `stop` ends the renewals and waits for the one under way, so the reservation is settled or
// released only after its last renewal. `renew` never rejects: its caller logs a failure, and the
// next renewal tries again. If the process dies, no renewal runs and the reservation expires.

export interface ReservationRenewal {
  /** No renewal runs after this resolves. */
  readonly stop: () => Promise<void>;
}

export function renewWhileRunning(renew: () => Promise<void>, everyMs: number): ReservationRenewal {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let underWay: Promise<void> = Promise.resolve();
  const schedule = (): void => {
    timer = setTimeout(() => {
      underWay = renew().then(() => {
        if (!stopped) schedule();
      });
    }, everyMs);
  };
  schedule();
  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await underWay;
    },
  };
}
