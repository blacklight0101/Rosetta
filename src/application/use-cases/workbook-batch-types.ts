import type { Actor } from '../../domain/accounts/actor.js';
import type { ERROR_CODES } from '../../domain/errors/codes.js';
import type { UploadSummary } from './upload-summary.js';
import type { LeftOut, WorkbookProgress, WorkbookSummaryLine } from '../ports/workbook-staging.js';

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

/** RF-159: where a batch is. The last two are its outcomes, kept for a while for the page to read. */
export type BatchPhase = 'open' | 'processing' | 'stored' | 'refused';

/** RF-159, DEC-183: what the page asks for every second while a batch is processed. */
export interface BatchState {
  readonly batchId: string;
  readonly phase: BatchPhase;
  /** The workbooks the batch holds. */
  readonly files: number;
  /** Since the finish was accepted, until the work ended; 0 while the batch is open. */
  readonly elapsedMs: number;
  /** While processing: the step and the counts. */
  readonly progress?: WorkbookProgress;
  /** When stored: what the page shows (RF-150); for the batch of a zip, the summary of the upload (RF-128). */
  readonly summary?: WorkbookBatchSummary | UploadSummary;
  /** When refused: the error, which the presentation turns into code, message and next step (RF-158). */
  readonly refusal?: unknown;
}

/** RF-159: a cancel stops the batch, unless its work had already ended; then it answers how it ended. */
export type CancelOutcome =
  { readonly cancelled: true } | { readonly cancelled: false; readonly state: BatchState };
