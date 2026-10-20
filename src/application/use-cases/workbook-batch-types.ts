import type { Actor } from '../../domain/accounts/actor.js';
import type { ERROR_CODES } from '../../domain/errors/codes.js';
import type { LeftOut, WorkbookSummaryLine } from '../ports/workbook-staging.js';

// RF-150: the requests and answers of the workbook batch use case.

export type BatchProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.conflict
  | typeof ERROR_CODES.uploadInProgress
  | typeof ERROR_CODES.requestInvalid
  | typeof ERROR_CODES.uploadNameUnreadable;

export interface BatchRef {
  readonly actor: Actor;
  readonly projectId: string;
  readonly batchId: string;
}

export interface BatchFileRequest extends BatchRef {
  /** The file name as the page sent it (percent-encoded). */
  readonly fileName: string | undefined;
  readonly body: AsyncIterable<Uint8Array>;
  readonly declaredBytes: number | undefined;
  readonly signal: AbortSignal;
}

export interface FinishBatchRequest extends BatchRef {
  readonly ip: string;
  readonly signal: AbortSignal;
}

/** What the page shows after a batch is finished (RF-150). */
export interface WorkbookBatchSummary {
  readonly workbooks: readonly WorkbookSummaryLine[];
  readonly skipped: readonly LeftOut[];
  readonly snapshotHash: string;
  readonly uploadedAt: string;
  /** The newest run read another snapshot than the one just stored (false while no run has one). */
  readonly codeChangedSinceLastRun: boolean;
}
