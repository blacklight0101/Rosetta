import type { Logger } from '../ports/logger.js';

// RF-128, RF-133, RF-159: once the source is attached the upload has happened. The steps that follow (the
// earlier snapshot going, the new one named, the audit rows) must not turn it into a refusal: a failure
// is logged and skipped, and the batch ends stored.

/** What an operator needs to trace a skipped step and to rebuild it. */
export interface StepContext {
  readonly projectId: string;
  readonly snapshotKey: string;
  /** The batch of the work; absent for a zip that was answered in its own request. */
  readonly batchId?: string | undefined;
}

/** Runs one step after the attach; its failure is logged at error with its context and never thrown. */
export async function bestEffort(
  logger: Logger,
  step: string,
  context: StepContext,
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
        data: {
          ...{ projectId: context.projectId, snapshotKey: context.snapshotKey, step, reason },
          ...(context.batchId === undefined ? {} : { batchId: context.batchId }),
        },
      });
    } catch {
      // The log is down as well: the source is attached all the same.
    }
  }
}
