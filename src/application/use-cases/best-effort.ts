import type { Logger } from '../ports/logger.js';

// RF-128, RF-133, RF-159: once the source is attached the upload has happened. The steps that follow (the
// earlier snapshot going, the new one named, the audit rows) must not turn it into a refusal: a failure
// is logged and skipped, and the batch ends stored.

/** Runs one step after the attach; its failure is logged at error and never thrown. */
export async function bestEffort(
  logger: Logger,
  step: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    try {
      await logger.log({
        level: 'error',
        logger: 'sources',
        message: `A step after the source was attached failed and was skipped (best effort): ${step}.`,
        data: { reason },
      });
    } catch {
      // The log is down as well: the source is attached all the same.
    }
  }
}
