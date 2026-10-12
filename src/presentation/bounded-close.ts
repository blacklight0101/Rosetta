import type { Logger } from '../application/ports/logger.js';

// ADR-014 (P1-68): how long shutdown waits for the database pool before the process exits anyway;
// well inside the 10-second grace period `docker stop` gives before it kills the container.
const poolEndDeadlineMs = 5_000;

/**
 * RF-1302, ADR-014 (P1-68): closes the pool, but a frozen database must not keep the process alive
 * after SIGTERM. Resolves when `end()` settles first (rejecting with its error) or when the
 * deadline passes, logging a warning; the timer never outlives the race.
 */
export async function closePool(pool: { end(): Promise<void> }, logger: Logger): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      const message = `The database pool did not close within ${String(poolEndDeadlineMs)} ms; stopping without it.`;
      // A log that cannot be written must not keep the shutdown from finishing.
      void Promise.allSettled([logger.log({ level: 'warn', logger: 'db', message })]);
      resolve();
    }, poolEndDeadlineMs);
  });
  try {
    await Promise.race([pool.end(), expired]);
  } finally {
    clearTimeout(timer);
  }
}
