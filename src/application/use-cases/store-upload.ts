import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';

// RF-128, RF-129, RF-130, RF-133: Store upload turns the zip a user sends into the project's source.

export interface StoreUploadDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly uploads: UploadStore;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  /** `ROSETTA_UPLOAD_MAX_MB` in bytes. */
  readonly limitBytes: number;
}

export interface StoreUploadRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** The file name as the page sent it (percent-encoded); the project name is used when absent. */
  readonly fileName: string | undefined;
  readonly body: AsyncIterable<Uint8Array>;
  readonly declaredBytes: number | undefined;
  readonly ip: string;
  readonly signal: AbortSignal;
}

/** What the page shows after an upload (RF-128). */
export interface UploadSummary {
  readonly files: number;
  readonly size: number;
  readonly skipped: number;
  readonly snapshotHash: string;
  readonly fileName: string;
  readonly uploadedAt: string;
}

export type UploadProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.conflict
  | typeof ERROR_CODES.uploadInProgress
  | typeof ERROR_CODES.zipNotReadable;

export class StoreUpload {
  readonly deps: StoreUploadDependencies;

  constructor(deps: StoreUploadDependencies) {
    this.deps = deps;
  }

  // RF-128
  execute(request: StoreUploadRequest): Promise<Result<UploadSummary, UploadProblem>> {
    return Promise.resolve(
      err(request.projectId === '' ? ERROR_CODES.conflict : ERROR_CODES.notFound),
    );
  }

  /** Stops every upload in flight (server shutdown). */
  abortAll(): void {
    // not implemented
  }
}
