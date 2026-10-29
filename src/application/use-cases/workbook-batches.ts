import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { workbookFileName } from '../../domain/sources/workbook-name.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { StagedFile, WorkbookProgress, WorkbookStaging } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';
import { IntervalTask } from '../projects/interval-task.js';
import { finishWorkbooks } from './finish-workbooks.js';
import { hasEnded, newBatch, stateOf, type HeldBatch } from './workbook-batch-state.js';
import type {
  BatchFileRequest,
  BatchProblem,
  BatchRef,
  BatchState,
  CancelOutcome,
  FinishBatchRequest,
} from './workbook-batch-types.js';

// RF-150, RF-152, RF-157, RFC-005 section 4.2: Workbook batches turn the files a user sends into the
// source of a workbook project. A batch is opened (one per project), takes one workbook per request,
// and is finished: every workbook is read, rendered and published, or none is. A batch not finished
// within 30 minutes is deleted. Refusals of a file are thrown by the staging area, naming the file.
// RF-159, DEC-183: the finish is accepted at once and the work goes on after the request; the batch keeps
// its progress and, for 30 minutes after the work ended, its outcome, for the page to read.

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
  BatchState,
  CancelOutcome,
  FinishBatchRequest,
  WorkbookBatchSummary,
} from './workbook-batch-types.js';

interface Located {
  readonly project: Project;
  readonly batch: HeldBatch;
}

/** RFC-005 section 4.2: a batch not finished within 30 minutes is deleted; one that ended, 30 minutes after it. */
const BATCH_LIFETIME_MS = 30 * 60_000;

/** The first report of a batch at work, before the staging area says anything. */
const STARTING: WorkbookProgress = {
  ...{ step: 'reading', workbook: 0, workbooks: 0, sheet: 0, sheets: 0, cells: 0 },
};

export class WorkbookBatches {
  readonly deps: WorkbookBatchesDependencies;
  /** The batch of each project (one at a time), by project id. */
  private readonly batches = new Map<string, HeldBatch>();
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
    const held = this.batches.get(projectId);
    // Nothing awaits between this check and the claim, so two opens together cannot both pass.
    if ((held !== undefined && !hasEnded(held)) || this.opening.has(projectId)) {
      return err(ERROR_CODES.uploadInProgress);
    }
    this.opening.add(projectId);
    try {
      // The outcome of the last batch is replaced by the new batch (RF-159).
      if (held !== undefined) await this.drop(projectId, held);
      const batchId = await this.deps.staging.open(this.deps.limitBytes);
      const openedAt = this.deps.clock.now().getTime();
      this.batches.set(projectId, newBatch(batchId, actor.userId, openedAt));
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
    const unusable = unusableBecause(batch);
    if (unusable !== undefined) return err(unusable);
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

  /**
   * RF-159, DEC-183: accepts the batch and answers at once; every workbook is read, rendered and
   * published, or none is, after the request. The state tells how it goes and how it ended.
   */
  async finish(request: FinishBatchRequest): Promise<Result<BatchState, BatchProblem>> {
    await this.sweep();
    const located = await this.locate(request);
    if (!located.ok) return located;
    const { project, batch } = located.value;
    const unusable = unusableBecause(batch);
    if (unusable !== undefined) return err(unusable);
    if (batch.files === 0) return err(ERROR_CODES.requestInvalid);
    const own = new AbortController();
    batch.busy = own;
    batch.phase = 'processing';
    batch.startedAt = this.deps.clock.now().getTime();
    batch.progress = STARTING;
    batch.work = this.process({ request, project, batch, signal: own.signal });
    return ok(stateOf(batch, batch.startedAt));
  }

  /** The state of a batch (RF-159); not found for an unknown batch and for one of another user. */
  async state(request: BatchRef): Promise<Result<BatchState, BatchProblem>> {
    await this.sweep();
    const located = await this.locate(request);
    if (!located.ok) return located;
    return ok(stateOf(located.value.batch, this.deps.clock.now().getTime()));
  }

  /** The state of the batch of a project, for a page that was reloaded and has no batch id (RF-159). */
  async current(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<BatchState, BatchProblem>> {
    await this.sweep();
    const { actor, projectId } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    const batch = this.batches.get(projectId);
    if (project === undefined || batch?.userId !== actor.userId) return err(ERROR_CODES.notFound);
    return ok(stateOf(batch, this.deps.clock.now().getTime()));
  }

  /**
   * RF-150, RF-159: stops a batch that is open or at work (a batch at work publishes nothing). A batch
   * whose work already ended is left as it is and its state answered, so the page shows how it ended.
   */
  async cancel(request: BatchRef): Promise<Result<CancelOutcome, BatchProblem>> {
    await this.sweep();
    const located = await this.locate(request);
    if (!located.ok) return located;
    const { batch } = located.value;
    if (hasEnded(batch)) {
      return ok({ cancelled: false, state: stateOf(batch, this.deps.clock.now().getTime()) });
    }
    batch.busy?.abort();
    await this.drop(request.projectId, batch);
    return ok({ cancelled: true });
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

  /** Server shutdown: stops the work in flight and deletes every batch with its reserved space. */
  async close(): Promise<void> {
    this.sweeper.stop();
    this.abortAll();
    const works = [...this.batches.values()].flatMap((batch) =>
      batch.work === undefined ? [] : [batch.work],
    );
    await Promise.all(works);
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

  /** RF-159: the work after the request; it never rejects, its outcome is kept on the batch. */
  private async process(input: {
    readonly request: FinishBatchRequest;
    readonly project: Project;
    readonly batch: HeldBatch;
    readonly signal: AbortSignal;
  }): Promise<void> {
    const { request, project, batch, signal } = input;
    const outcome = await finishWorkbooks(this.deps, {
      ...{ batchId: batch.id, actor: request.actor, ip: request.ip, project, signal },
      onProgress: (progress) => {
        batch.progress = progress;
      },
    });
    batch.outcome = outcome;
    batch.endedAt = this.deps.clock.now().getTime();
    batch.busy = undefined;
    batch.progress = undefined;
    batch.phase = outcome.kind;
  }

  /** Ends a batch that expired once the work on it is over. */
  private async settle(projectId: string, batch: HeldBatch): Promise<void> {
    batch.busy = undefined;
    if (batch.expired) await this.drop(projectId, batch);
  }

  private async drop(projectId: string, batch: HeldBatch): Promise<void> {
    if (this.batches.get(projectId) === batch) this.batches.delete(projectId);
    await this.deps.staging.discard(batch.id);
  }

  /**
   * Deletes the batches left open for 30 minutes and the outcomes 30 minutes after the work ended; a
   * batch at work is left to finish (its own bound stops it), one still receiving a file is stopped.
   */
  private async sweep(): Promise<void> {
    const now = this.deps.clock.now().getTime();
    for (const [projectId, batch] of [...this.batches]) {
      if (batch.phase === 'processing') continue;
      if (now - (batch.endedAt ?? batch.openedAt) <= BATCH_LIFETIME_MS) continue;
      if (batch.busy === undefined) await this.drop(projectId, batch);
      else {
        batch.expired = true;
        batch.busy.abort();
      }
    }
  }
}

/** Why a file or a finish cannot be taken now: the batch is at work, or it has ended (RF-159). */
function unusableBecause(batch: HeldBatch): BatchProblem | undefined {
  if (batch.phase === 'processing' || batch.busy !== undefined) return ERROR_CODES.uploadInProgress;
  return batch.phase === 'open' ? undefined : ERROR_CODES.notFound;
}
