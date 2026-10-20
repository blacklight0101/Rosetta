import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { uploadFileName } from '../../domain/sources/upload-name.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { StoredUpload, UploadStore } from '../ports/upload-store.js';
import type { LeftOut, WorkbookSummaryLine } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';
import { pruneEarlier } from '../projects/prune-snapshot.js';
import { recordWorkbooks } from '../projects/record-workbooks.js';

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
  /** The newest run read another snapshot than the one just stored (false while no run has one). */
  readonly codeChangedSinceLastRun: boolean;
  /** RF-150, Q-41: only when the zip held workbooks; what was rendered, and what was left out. */
  readonly workbooks?: readonly WorkbookSummaryLine[];
  readonly leftOut?: readonly LeftOut[];
}

export type UploadProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.conflict
  | typeof ERROR_CODES.uploadInProgress
  | typeof ERROR_CODES.zipNotReadable
  | typeof ERROR_CODES.uploadNameUnreadable;

/** The answer for the page; the workbook fields only when the zip held workbooks (RF-150). */
function summaryOf(
  stored: StoredUpload,
  project: Project,
  fileName: string,
  uploadedAt: string,
): UploadSummary {
  return {
    files: stored.info.fileCount,
    size: stored.info.totalBytes,
    skipped: stored.skipped,
    snapshotHash: stored.info.snapshotHash,
    fileName,
    uploadedAt,
    codeChangedSinceLastRun:
      project.lastRunSnapshotKey !== undefined && project.lastRunSnapshotKey !== stored.key,
    ...(stored.workbooks === undefined
      ? {}
      : { workbooks: stored.workbooks, leftOut: stored.leftOut ?? [] }),
  };
}

export class StoreUpload {
  readonly deps: StoreUploadDependencies;
  /** One upload per project at a time; the key holds the owner so another user learns nothing. */
  private readonly active = new Map<string, AbortController>();

  constructor(deps: StoreUploadDependencies) {
    this.deps = deps;
  }

  // RF-128, RF-129
  async execute(request: StoreUploadRequest): Promise<Result<UploadSummary, UploadProblem>> {
    const lock = `${request.actor.userId}:${request.projectId}`;
    if (this.active.has(lock)) return err(ERROR_CODES.uploadInProgress);
    const own = new AbortController();
    this.active.set(lock, own);
    try {
      return await this.store(request, AbortSignal.any([request.signal, own.signal]));
    } finally {
      this.active.delete(lock);
    }
  }

  /** Stops every upload in flight (server shutdown). */
  abortAll(): void {
    for (const upload of this.active.values()) upload.abort();
  }

  private async store(
    request: StoreUploadRequest,
    signal: AbortSignal,
  ): Promise<Result<UploadSummary, UploadProblem>> {
    const { projects, uploads, clock } = this.deps;
    const project = await projects.find(request.actor.userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    if (project.sourceKind !== 'upload') return err(ERROR_CODES.conflict);
    const name = uploadFileName(request.fileName, project.name);
    if (!name.ok) {
      return err(
        name.error === 'bad-encoding'
          ? ERROR_CODES.uploadNameUnreadable
          : ERROR_CODES.zipNotReadable,
      );
    }
    const uploadedAt = clock.now();
    const stored = await uploads.store({
      projectId: project.id,
      fileName: name.value,
      uploadedAt: uploadedAt.toISOString(),
      body: request.body,
      declaredBytes: request.declaredBytes,
      limitBytes: this.deps.limitBytes,
      signal,
    });
    const workbooks = stored.info.workbooks?.length ?? 0;
    const attached = await projects.attachUpload({
      userId: project.userId,
      projectId: project.id,
      upload: {
        ...{ fileName: name.value, uploadedAt: uploadedAt.getTime(), snapshotKey: stored.key },
        ...(workbooks === 0 ? {} : { workbooks }),
      },
      updatedAt: uploadedAt.getTime(),
    });
    if (attached === undefined) {
      // The project was deleted while the zip arrived: its new snapshot has no owner.
      await uploads.remove(stored.key);
      return err(ERROR_CODES.notFound);
    }
    await pruneEarlier(this.deps, project, stored.key);
    await this.record(request, project.id, stored);
    await recordWorkbooks(this.deps, {
      ...{ actor: request.actor, projectId: project.id, ip: request.ip },
      snapshotHash: stored.info.snapshotHash,
      workbooks: stored.info.workbooks ?? [],
    });
    return ok(summaryOf(stored, project, name.value, uploadedAt.toISOString()));
  }

  // RF-133: the name, size and hash of the zip, never its content.
  private async record(
    request: StoreUploadRequest,
    projectId: string,
    stored: StoredUpload,
  ): Promise<void> {
    const { auditLog, logger, clock } = this.deps;
    await auditLog.record({
      at: clock.now(),
      actorUserId: request.actor.userId,
      action: 'source.uploaded',
      targetType: 'project',
      targetId: projectId,
      ip: request.ip,
      outcome: 'ok',
      detail: {
        fileName: stored.info.fileName,
        size: stored.zipBytes,
        keptBytes: stored.info.totalBytes,
        files: stored.info.fileCount,
        snapshotHash: stored.info.snapshotHash,
      },
    });
    await logger.log({
      level: 'info',
      logger: 'sources',
      message: 'A zip was stored as the source of a project.',
      userId: request.actor.userId,
      data: { projectId, files: stored.info.fileCount, size: stored.zipBytes },
    });
  }
}
