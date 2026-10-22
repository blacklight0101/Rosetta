import type { Clock } from '../../application/ports/clock.js';

// RF-422, ADR-007, P3-99: keeps the reservation of a call in flight counting. A streamed answer
// can run longer than its timeout x attempts (the timeout counts only idle time, Q-60), so its
// first expiry is not the end of the call. While the call runs:
//   - every third of the lifetime, `renew` moves the expiry to one lifetime from now;
//   - a renewal that fails is reported to `failed` and tried again after a short back-off (a
//     thirty-sixth of the lifetime), so one failure leaves most of the lifetime as slack;
//   - when no renewal has succeeded by the time less than a sixth of the lifetime is left, the
//     reservation would lapse while the call can still spend: `lapsing` is called once (the guard
//     stops the call) and nothing more is renewed. The deadline is a timer of its own, so a
//     renewal that never answers cannot hold it back (fail closed).
// `stop` ends the renewals and waits for one under way, so the reservation is settled or released
// only after its last renewal; after a lapse it does not wait, as that renewal may never answer
// (a late renewal only updates a row that still exists, so it cannot bring one back). Nothing
// here rejects: a failing `renew` or `failed` is caught. If the process dies, nothing renews and
// the reservation expires.

export interface RenewalPlan {
  /** Moves the reservation's expiry; rejects when it could not. */
  readonly renew: (expiresAt: Date) => Promise<void>;
  /** Reports a renewal that failed; its own failure is ignored. */
  readonly failed: (error: unknown) => Promise<void>;
  /** The reservation would lapse before a renewal succeeds: stop the call. */
  readonly lapsing: () => void;
  readonly clock: Clock;
  readonly lifetimeMs: number;
  /** The expiry of the reservation as it was made. */
  readonly expiresAt: Date;
}

export interface ReservationRenewal {
  /** No renewal runs after this resolves; it never rejects. */
  readonly stop: () => Promise<void>;
}

/** The pauses of a renewal plan, from the reservation's lifetime. */
function pausesOf(lifetimeMs: number): { every: number; retry: number; margin: number } {
  return {
    every: Math.floor(lifetimeMs / 3),
    retry: Math.max(1, Math.floor(lifetimeMs / 36)),
    margin: Math.floor(lifetimeMs / 6),
  };
}

/** Reports a failed renewal; a failure of the report itself is ignored, so this never rejects. */
async function reportFailure(plan: RenewalPlan, error: unknown): Promise<void> {
  await Promise.resolve()
    .then(() => plan.failed(error))
    .catch(() => undefined);
}

export function renewWhileRunning(plan: RenewalPlan): ReservationRenewal {
  const { every, retry, margin } = pausesOf(plan.lifetimeMs);
  let stopped = false;
  let lapsed = false;
  let next: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let underWay: Promise<void> = Promise.resolve();
  const end = (): void => {
    stopped = true;
    clearTimeout(next);
    clearTimeout(deadline);
  };
  const lapse = (): void => {
    end();
    lapsed = true;
    plan.lapsing();
  };
  const holdUntil = (expiresAt: number): void => {
    clearTimeout(deadline);
    deadline = setTimeout(lapse, expiresAt - margin - plan.clock.now().getTime());
  };
  /** One renewal; answers how long to wait before the next one. */
  const attempt = async (): Promise<number> => {
    const expiresAt = plan.clock.now().getTime() + plan.lifetimeMs;
    try {
      await plan.renew(new Date(expiresAt));
    } catch (error) {
      await reportFailure(plan, error);
      return retry;
    }
    if (!stopped) holdUntil(expiresAt);
    return every;
  };
  const schedule = (waitMs: number): void => {
    next = setTimeout(() => {
      underWay = attempt().then((after) => {
        if (!stopped) schedule(after);
      });
    }, waitMs);
  };
  holdUntil(plan.expiresAt.getTime());
  schedule(every);
  return {
    stop: async () => {
      end();
      if (!lapsed) await underWay;
    },
  };
}
