import { ERROR_CODES } from '../../domain/errors/codes.js';
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
  /** The batch that failed, named in the log of a time-bound refusal. */
  readonly batchId: string;
}

async function timedOut(logger: Logger, batchId: string, reason: string): Promise<void> {
  try {
    await logger.log({
      level: 'error',
      logger: 'sources',
      message: 'A batch took too long and was refused.',
      code: ERROR_CODES.uploadTimedOut,
      data: { batchId, reason },
    });
  } catch {
    // The log is down as well: the outcome still ends the batch.
  }
}

/** Logs the failure if the log can take it; it never rejects, so the batch still ends. */
export async function logBatchFailure(logger: Logger, failure: BatchFailure): Promise<void> {
  const { error, signal } = failure;
  const reason = error instanceof Error ? error.message : 'unknown';
  if (error instanceof RosettaError) {
    // RST-1918 is the one refusal an operator must read: the work took too long (a database that hangs).
    if (error.code === ERROR_CODES.uploadTimedOut) await timedOut(logger, failure.batchId, reason);
    return;
  }
  const stopped = signal.aborted;
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
