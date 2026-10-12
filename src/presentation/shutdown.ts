import type { Logger } from '../application/ports/logger.js';

// RF-1302, ADR-014 (P1-68): one deadline for the whole stop, so a frozen database cannot keep the
// process alive. It is well inside the 10-second grace period `docker stop` gives before it kills
// the container.
const stopDeadlineMs = 5_000;
// How long the warning of an expired deadline may take to be written before the process exits.
const logGraceMs = 250;

/** `clean`: every step finished; `deadline`: the deadline passed and the stop gave up waiting. */
export type StopOutcome = 'clean' | 'deadline';

export interface StopSteps {
  /** Stops the runs and closes the server; resolves when both are done. */
  readonly close: () => Promise<void>;
  readonly pool: { end(): Promise<void> };
}

/** Waits for `task`, but never longer than `ms`; its failure is ignored (it is a log write). */
async function settleWithin(task: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([Promise.allSettled([task]), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the steps in order (the runs and the server, then the pool) under one deadline. The pool is
 * closed even when the first step fails. Resolves `clean` when they finish, rejects with the error
 * of a step that fails first, and resolves `deadline` (after logging a warning) when the deadline
 * passes first; the timer never outlives the race.
 */
export async function stopWithin(steps: StopSteps, logger: Logger): Promise<StopOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<StopOutcome>((resolve) => {
    timer = setTimeout(() => {
      const message = `Shutdown did not finish within ${String(stopDeadlineMs)} ms; stopping without waiting for the database.`;
      // A log that cannot be written must not keep the shutdown from finishing.
      void settleWithin(logger.log({ level: 'warn', logger: 'db', message }), logGraceMs).then(
        () => {
          resolve('deadline');
        },
      );
    }, stopDeadlineMs);
  });
  const finished = (async (): Promise<StopOutcome> => {
    await steps.close();
    await steps.pool.end();
    return 'clean';
  })();
  // If the deadline wins, a later failure of `finished` must not surface as an unhandled rejection.
  void Promise.allSettled([finished]);
  try {
    return await Promise.race([finished, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SIGTERM and SIGINT stop the application and then end the process: after the deadline the pool's
 * sockets to a frozen database are still open and would keep it alive. Exit code 0 for a clean stop,
 * 1 when the deadline was hit or the stop failed (`reportFailure` prints the failure first).
 */
export function installShutdown(
  application: { stop(): Promise<StopOutcome> },
  reportFailure: (error: unknown) => void,
): void {
  const shutDown = (): void => {
    application.stop().then(
      (outcome) => {
        void outcome;
      },
      (error: unknown) => {
        reportFailure(error);
        process.exitCode = 1;
      },
    );
  };
  process.once('SIGTERM', shutDown);
  process.once('SIGINT', shutDown);
}
