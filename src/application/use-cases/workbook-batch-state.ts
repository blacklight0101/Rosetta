import type { WorkbookProgress } from '../ports/workbook-staging.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { UploadSummary } from './upload-summary.js';
import type {
  BatchPhase,
  BatchProblem,
  BatchState,
  WorkbookBatchSummary,
} from './workbook-batch-types.js';

// RF-150, RF-159, DEC-183: what the use case keeps of a batch while it is open, at work and after it
// ended, and how that becomes the state the page reads.

/** How a batch that was finished ended: stored, or refused with the error that stopped it. */
export type BatchOutcome =
  | { readonly kind: 'stored'; readonly summary: WorkbookBatchSummary | UploadSummary }
  | { readonly kind: 'refused'; readonly error: unknown };

/** A batch that is held: who owns it, since when, how much it holds and what is running on it. */
export interface HeldBatch {
  readonly id: string;
  readonly userId: string;
  readonly openedAt: number;
  bytes: number;
  files: number;
  phase: BatchPhase;
  /** Set while a file or the work after the finish is going on; one at a time. */
  busy: AbortController | undefined;
  /** The lifetime passed while a file was being read: it goes when the file ends. */
  expired: boolean;
  /** When the finish was accepted, and when the work ended (milliseconds since the epoch). */
  startedAt: number | undefined;
  endedAt: number | undefined;
  progress: WorkbookProgress | undefined;
  outcome: BatchOutcome | undefined;
  /** The work after the finish; it never rejects. */
  work: Promise<void> | undefined;
  /** The work is attaching the source, which a cancel cannot stop: it waits for the end. */
  attaching: boolean;
}

export function newBatch(id: string, userId: string, openedAt: number): HeldBatch {
  return {
    ...{ id, userId, openedAt, bytes: 0, files: 0, phase: 'open', busy: undefined },
    ...{ expired: false, startedAt: undefined, endedAt: undefined },
    ...{ progress: undefined, outcome: undefined, work: undefined, attaching: false },
  };
}

/** A batch whose work has ended; it stays readable for the lifetime counted from the end. */
export const hasEnded = (batch: HeldBatch): boolean =>
  batch.phase === 'stored' || batch.phase === 'refused';

/** The state of a batch at `now` (milliseconds since the epoch). */
export function stateOf(batch: HeldBatch, now: number): BatchState {
  const elapsed = batch.startedAt === undefined ? 0 : (batch.endedAt ?? now) - batch.startedAt;
  const { outcome } = batch;
  return {
    batchId: batch.id,
    phase: batch.phase,
    files: batch.files,
    elapsedMs: Math.max(0, elapsed),
    ...(batch.phase === 'processing' && batch.progress !== undefined
      ? { progress: batch.progress }
      : {}),
    ...(outcome?.kind === 'stored' ? { summary: outcome.summary } : {}),
    ...(outcome?.kind === 'refused' ? { refusal: outcome.error } : {}),
  };
}

/** The first report of a batch at work, before the work says anything. */
export const STARTING: WorkbookProgress = {
  ...{ step: 'reading', workbook: 0, workbooks: 0, sheet: 0, sheets: 0, cells: 0 },
};

/** RF-159: the work on a batch ended; its outcome is kept for the page to read. */
export function endBatch(batch: HeldBatch, outcome: BatchOutcome, now: number): void {
  batch.outcome = outcome;
  batch.endedAt = now;
  batch.busy = undefined;
  batch.progress = undefined;
  batch.phase = outcome.kind;
}

/** Why a file or a finish cannot be taken now: the batch is at work, or it has ended (RF-159). */
export function unusableBecause(batch: HeldBatch): BatchProblem | undefined {
  if (batch.phase === 'processing' || batch.busy !== undefined) return ERROR_CODES.uploadInProgress;
  return batch.phase === 'open' ? undefined : ERROR_CODES.notFound;
}
