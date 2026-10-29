import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Logger } from '../ports/logger.js';

// RF-158, RF-159: how the work after a request tells that it did not end well, for a workbook batch
// and for the batch of a zip alike. A refusal (a RosettaError) is the outcome and needs no log; a stop
// by the user is told at info level; an error nobody expected is an error.

export interface BatchFailure {
  readonly error: unknown;
  /** The signal of the work: aborted when the user cancelled it. */
  readonly signal: AbortSignal;
  /** The messages for a stop and for an unexpected error. */
  readonly stopped: string;
  readonly unexpected: string;
}

/** Logs the failure if the log can take it; it never rejects, so the batch still ends. */
export async function logBatchFailure(logger: Logger, failure: BatchFailure): Promise<void> {
  const { error, signal } = failure;
  if (error instanceof RosettaError) return;
  const stopped = signal.aborted;
  const reason = error instanceof Error ? error.message : 'unknown';
  try {
    await logger.log({
      level: stopped ? 'info' : 'error',
      logger: 'sources',
      message: stopped ? failure.stopped : failure.unexpected,
      data: { reason },
    });
  } catch {
    // The log is down as well: the outcome still ends the batch.
  }
}
