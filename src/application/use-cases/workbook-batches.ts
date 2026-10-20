import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { workbookFileName, workbookSourceName } from '../../domain/sources/workbook-name.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { PublishedWorkbooks, StagedFile, WorkbookStaging } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';
import { IntervalTask } from '../projects/interval-task.js';
import type {
  BatchFileRequest,
  BatchProblem,
  BatchRef,
  FinishBatchRequest,
  WorkbookBatchSummary,
} from './workbook-batch-types.js';
import { pruneEarlier } from '../projects/prune-snapshot.js';
import { recordWorkbooks } from '../projects/record-workbooks.js';

// RF-150, RF-152, RF-157, RFC-005 section 4.2: Workbook batches turn the files a user sends into the
// source of a workbook project. A batch is opened (one per project), takes one workbook per request,
// and is finished: every workbook is read, rendered and published, or none is. A batch not finished
// within 30 minutes is deleted. Refusals of a file are thrown by the staging area, naming the file.

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

export type {
  BatchFileRequest,
  BatchProblem,
  BatchRef,
  FinishBatchRequest,
  WorkbookBatchSummary,
} from './workbook-batch-types.js';

/** A batch that is open: who owns it, since when, how much it holds and what is running on it. */
interface OpenBatch {
  readonly id: string;
  readonly userId: string;
  readonly openedAt: number;
  bytes: number;
  files: number;
  /** Set while a file or the finish is being handled; one at a time. */
  busy: AbortController | undefined;
  /** The 30 minutes passed while it was busy: it goes when the work ends. */
  expired: boolean;
}

interface Located {
  readonly project: Project;
  readonly batch: OpenBatch;
}

/** RFC-005 section 4.2: a batch not finished within 30 minutes is deleted. */
const BATCH_LIFETIME_MS = 30 * 60_000;

export class WorkbookBatches {
  readonly deps: WorkbookBatchesDependencies;
  /** The open batch of each project (one at a time), by project id. */
  private readonly batches = new Map<string, OpenBatch>();
  /** Projects whose batch is being opened, so two opens together cannot both pass. */
  private readonly opening = new Set<string>();
  private readonly sweeper = new IntervalTask();

  constructor(deps: WorkbookBatchesDependencies) {
    this.deps = deps;
  }

  // RF-150
  async open(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<{ readonly batchId: string }, BatchProblem>> {
    await this.sweep();
    const { actor, projectId } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    if (project.sourceKind !== 'workbook') return err(ERROR_CODES.conflict);
    // Nothing awaits between this check and the claim, so two opens together cannot both pass.
    if (this.batches.has(projectId) || this.opening.has(projectId)) {
      return err(ERROR_CODES.uploadInProgress);
    }
    this.opening.add(projectId);
    try {
      const batchId = await this.deps.staging.open(this.deps.limitBytes);
      const openedAt = this.deps.clock.now().getTime();
      const batch = { id: batchId, userId: actor.userId, openedAt, bytes: 0, files: 0 };
      this.batches.set(projectId, { ...batch, busy: undefined, expired: false });
      return ok({ batchId });
    } finally {
      this.opening.delete(projectId);
    }
  }

  // RF-150, RF-129
  async receive(request: BatchFileRequest): Promise<Result<StagedFile, BatchProblem>> {
    await this.sweep();
    const located = await this.locate(request);
    if (!located.ok) return located;
    const name = workbookFileName(request.fileName);
    if (!name.ok) {
      return err(
        name.error === 'bad-encoding'
          ? ERROR_CODES.uploadNameUnreadable
          : ERROR_CODES.requestInvalid,
      );
    }
    const { batch } = located.value;
    if (batch.busy !== undefined) return err(ERROR_CODES.uploadInProgress);
    const own = new AbortController();
    batch.busy = own;
    try {
      const stored = await this.deps.staging.receive(batch.id, {
        fileName: name.value,
        body: request.body,
        declaredBytes: request.declaredBytes,
        limitBytes: this.deps.limitBytes - batch.bytes,
        signal: AbortSignal.any([request.signal, own.signal]),
      });
      batch.bytes += stored.size;
      batch.files += 1;
      return ok(stored);
    } finally {
      await this.settle(request.projectId, batch);
    }
  }

  // RF-150, RF-152, RF-157
  async finish(request: FinishBatchRequest): Promise<Result<WorkbookBatchSummary, BatchProblem>> {
    await this.sweep();
    const located = await this.locate(request);
    if (!located.ok) return located;
    const { project, batch } = located.value;
    if (batch.busy !== undefined) return err(ERROR_CODES.uploadInProgress);
    if (batch.files === 0) return err(ERROR_CODES.requestInvalid);
    const own = new AbortController();
    batch.busy = own;
    try {
      const uploadedAt = this.deps.clock.now();
      const published = await this.deps.staging.publish(batch.id, {
        projectId: project.id,
        uploadedAt: uploadedAt.toISOString(),
        signal: AbortSignal.any([request.signal, own.signal]),
      });
      return await this.attach({ request, project, published, uploadedAt });
    } catch (error) {
      await this.deps.staging.discard(batch.id);
      throw error;
    } finally {
      batch.busy = undefined;
      // A cancel and a new batch may have come meanwhile: only this batch's own entry goes.
      if (this.batches.get(project.id) === batch) this.batches.delete(project.id);
    }
  }

  // RF-150
  async cancel(request: BatchRef): Promise<Result<undefined, BatchProblem>> {
    await this.sweep();
    const located = await this.locate(request);
    if (!located.ok) return located;
    const { batch } = located.value;
    batch.busy?.abort();
    await this.drop(request.projectId, batch);
    return ok(undefined);
  }

  /** Deletes the expired batches every `intervalMs` without waiting for a batch call (RF-150). */
  startSweeping(intervalMs: number): void {
    if (intervalMs <= 0) throw new RangeError('The sweep interval must be positive.');
    this.sweeper.start(
      intervalMs,
      () => this.sweep(),
      (error) =>
        this.deps.logger.log({
          level: 'warn',
          logger: 'sources',
          message: 'The sweep of expired workbook batches failed.',
          data: { reason: error instanceof Error ? error.message : 'unknown' },
        }),
    );
  }

  /** Server shutdown: stops the work in flight and deletes every open batch with its reserved space. */
  async close(): Promise<void> {
    this.sweeper.stop();
    this.abortAll();
    for (const [projectId, batch] of [...this.batches]) await this.drop(projectId, batch);
  }

  /** Stops every file and finish in flight (server shutdown). */
  abortAll(): void {
    this.sweeper.stop();
    for (const batch of this.batches.values()) batch.busy?.abort();
  }

  /** The project of the owner and the batch of that project; anything else is not found (RF-1105). */
  private async locate(request: BatchRef): Promise<Result<Located, BatchProblem>> {
    const { actor, projectId, batchId } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const batch = this.batches.get(projectId);
    if (batch?.id !== batchId || batch.userId !== actor.userId) return err(ERROR_CODES.notFound);
    return ok({ project, batch });
  }

  /** Records the published snapshot as the project's source (RF-150), or removes it when the project is gone. */
  private async attach(input: {
    readonly request: FinishBatchRequest;
    readonly project: Project;
    readonly published: PublishedWorkbooks;
    readonly uploadedAt: Date;
  }): Promise<Result<WorkbookBatchSummary, BatchProblem>> {
    const { request, project, published, uploadedAt } = input;
    const { projects, uploads } = this.deps;
    const names = published.info.workbooks.map((book) => book.fileName);
    const attached = await projects.attachUpload({
      userId: project.userId,
      projectId: project.id,
      upload: {
        fileName: workbookSourceName(names),
        uploadedAt: uploadedAt.getTime(),
        snapshotKey: published.key,
        workbooks: names.length,
      },
      updatedAt: uploadedAt.getTime(),
    });
    if (attached === undefined) {
      // The project was deleted while the batch was read: its new snapshot has no owner.
      await uploads.remove(published.key);
      return err(ERROR_CODES.notFound);
    }
    await pruneEarlier(this.deps, project, published.key);
    await recordWorkbooks(this.deps, {
      ...{ actor: request.actor, projectId: project.id, ip: request.ip },
      ...{ snapshotHash: published.info.snapshotHash, workbooks: published.info.workbooks },
    });
    return ok({
      workbooks: published.summary,
      skipped: published.skipped,
      snapshotHash: published.info.snapshotHash,
      uploadedAt: uploadedAt.toISOString(),
      codeChangedSinceLastRun:
        project.lastRunSnapshotKey !== undefined && project.lastRunSnapshotKey !== published.key,
    });
  }

  /** Ends a batch that expired once the work on it is over. */
  private async settle(projectId: string, batch: OpenBatch): Promise<void> {
    batch.busy = undefined;
    if (batch.expired) await this.drop(projectId, batch);
  }

  private async drop(projectId: string, batch: OpenBatch): Promise<void> {
    if (this.batches.get(projectId) === batch) this.batches.delete(projectId);
    await this.deps.staging.discard(batch.id);
  }

  /** Deletes the batches left open for 30 minutes; one still at work is stopped and goes when it ends. */
  private async sweep(): Promise<void> {
    const now = this.deps.clock.now().getTime();
    for (const [projectId, batch] of [...this.batches]) {
      if (now - batch.openedAt <= BATCH_LIFETIME_MS) continue;
      if (batch.busy === undefined) await this.drop(projectId, batch);
      else {
        batch.expired = true;
        batch.busy.abort();
      }
    }
  }
}
