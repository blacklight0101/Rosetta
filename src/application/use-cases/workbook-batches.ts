import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type {
  LeftOut,
  StagedFile,
  WorkbookStaging,
  WorkbookSummaryLine,
} from '../ports/workbook-staging.js';

// RF-150, RF-152, RF-157, RFC-005 section 4.2: Workbook batches turn the files a user sends into the source of a workbook project.

export interface WorkbookBatchesDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly uploads: Pick<UploadStore, 'remove'>;
  readonly staging: WorkbookStaging;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  /** `ROSETTA_UPLOAD_MAX_MB` in bytes: the total of one batch. */
  readonly limitBytes: number;
}

export type BatchProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.conflict
  | typeof ERROR_CODES.uploadInProgress
  | typeof ERROR_CODES.requestInvalid
  | typeof ERROR_CODES.uploadNameUnreadable;

export interface BatchFileRequest {
  readonly actor: Actor;
  readonly projectId: string;
  readonly batchId: string;
  /** The file name as the page sent it (percent-encoded). */
  readonly fileName: string | undefined;
  readonly body: AsyncIterable<Uint8Array>;
  readonly declaredBytes: number | undefined;
  readonly signal: AbortSignal;
}

export interface BatchRef {
  readonly actor: Actor;
  readonly projectId: string;
  readonly batchId: string;
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
  readonly codeChangedSinceLastRun: boolean;
}

export class WorkbookBatches {
  readonly deps: WorkbookBatchesDependencies;

  constructor(deps: WorkbookBatchesDependencies) {
    this.deps = deps;
  }

  open(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<{ readonly batchId: string }, BatchProblem>> {
    return this.unknown(request.projectId);
  }

  receive(request: BatchFileRequest): Promise<Result<StagedFile, BatchProblem>> {
    return this.unknown(request.projectId);
  }

  finish(request: FinishBatchRequest): Promise<Result<WorkbookBatchSummary, BatchProblem>> {
    return this.unknown(request.projectId);
  }

  cancel(request: BatchRef): Promise<Result<undefined, BatchProblem>> {
    return this.unknown(request.projectId);
  }

  private unknown(projectId: string): Promise<Result<never, BatchProblem>> {
    return Promise.resolve(
      err(projectId === '' ? ERROR_CODES.requestInvalid : ERROR_CODES.notFound),
    );
  }

  /** Stops every file in flight (server shutdown). */
  abortAll(): void {
    // Implemented with the use case.
  }
}
