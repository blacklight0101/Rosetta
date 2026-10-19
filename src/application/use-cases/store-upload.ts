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
import type { Project } from '../projects/project.js';

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
    if (!name.ok) return err(ERROR_CODES.zipNotReadable);
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
    const attached = await projects.attachUpload({
      userId: project.userId,
      projectId: project.id,
      upload: { fileName: name.value, uploadedAt: uploadedAt.getTime(), snapshotKey: stored.key },
      updatedAt: uploadedAt.getTime(),
    });
    if (attached === undefined) {
      // The project was deleted while the zip arrived: its new snapshot has no owner.
      await uploads.remove(stored.key);
      return err(ERROR_CODES.notFound);
    }
    await this.pruneEarlier(project, stored.key);
    await this.record(request, project.id, stored);
    return ok({
      files: stored.info.fileCount,
      size: stored.info.totalBytes,
      skipped: stored.skipped,
      snapshotHash: stored.info.snapshotHash,
      fileName: name.value,
      uploadedAt: uploadedAt.toISOString(),
    });
  }

  /** RF-128: the earlier snapshot goes unless a run uses it or may still read the source. */
  private async pruneEarlier(project: Project, newKey: string): Promise<void> {
    const earlier = project.upload?.snapshotKey;
    if (earlier === undefined || earlier === newKey) return;
    const runs = await this.deps.runs.list(project.userId, project.id);
    if (runs.some((run) => run.queueState !== 'Ended' || run.snapshotKey === earlier)) return;
    await this.deps.uploads.remove(earlier);
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
