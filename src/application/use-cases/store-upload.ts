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
import { pruneEarlier } from '../projects/prune-snapshot.js';
import { recordWorkbooks } from '../projects/record-workbooks.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { endBatch, stateOf, type BatchOutcome, type HeldBatch } from './workbook-batch-state.js';
import type { BatchState } from './workbook-batch-types.js';
import { withinAttachLimit } from './attach-limit.js';
import { bestEffort } from './best-effort.js';
import { recordUpload } from './record-upload.js';
import { logBatchFailure } from './batch-failure-log.js';
import { summaryOf, type UploadSummary } from './upload-summary.js';
import type { WorkbookBatches } from './workbook-batches.js';

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
  /** RF-159: how long the attach may take before the batch ends refused; 60 seconds when absent. */
  readonly attachTimeoutMs?: number;
  /** RF-159, DEC-188: where the batch of a zip that holds workbooks lives, read like a workbook batch. */
  readonly batches: Pick<WorkbookBatches, 'claim' | 'adopt'>;
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

/** RF-159, DEC-188: the zip holds workbooks, so it was accepted at once; its batch tells how it goes. */
export interface AcceptedUpload extends Partial<Record<keyof UploadSummary, undefined>> {
  readonly accepted: BatchState;
}

/** What the store is given for one upload: its signal and the call that accepts the zip. */
interface Hooks {
  readonly signal: AbortSignal;
  readonly onWorkbooks: () => Promise<void>;
}

/** What `execute` is doing for one upload: the batch, once the zip is known to hold workbooks. */
interface Upload {
  batch: HeldBatch | undefined;
}

export type UploadProblem =
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.conflict
  | typeof ERROR_CODES.uploadInProgress
  | typeof ERROR_CODES.zipNotReadable
  | typeof ERROR_CODES.uploadNameUnreadable;

export class StoreUpload {
  readonly deps: StoreUploadDependencies;
  /** One upload per project at a time; the key holds the owner so another user learns nothing. */
  private readonly active = new Map<string, AbortController>();

  constructor(deps: StoreUploadDependencies) {
    this.deps = deps;
  }

  // RF-128, RF-129, RF-159
  async execute(
    request: StoreUploadRequest,
  ): Promise<Result<UploadSummary | AcceptedUpload, UploadProblem>> {
    const lock = `${request.actor.userId}:${request.projectId}`;
    if (this.active.has(lock)) return err(ERROR_CODES.uploadInProgress);
    const own = new AbortController();
    this.active.set(lock, own);
    // The client going away stops the upload until the zip is accepted; after that it is not its.
    const intake = new AbortController();
    const forward = (): void => {
      intake.abort(request.signal.reason);
    };
    if (request.signal.aborted) forward();
    else request.signal.addEventListener('abort', forward, { once: true });
    const upload: Upload = { batch: undefined };
    let accept: (batch: HeldBatch) => void = () => undefined;
    const acceptance = new Promise<HeldBatch>((resolve) => {
      accept = resolve;
    });
    const onWorkbooks = (): Promise<void> => {
      request.signal.removeEventListener('abort', forward);
      if (intake.signal.aborted) return Promise.reject(new Error('The upload was stopped.'));
      const { userId } = request.actor;
      upload.batch = this.deps.batches.adopt({ userId, projectId: request.projectId, stop: own });
      accept(upload.batch);
      return Promise.resolve();
    };
    const signal = AbortSignal.any([intake.signal, own.signal]);
    const work = this.store(request, { signal, onWorkbooks }, upload).finally(() => {
      if (this.active.get(lock) === own) this.active.delete(lock);
    });
    const first = await Promise.race([
      work.then((result) => ({ result })),
      acceptance.then((batch) => ({ batch })),
    ]);
    if ('result' in first) return first.result;
    // From here the batch guards the project, and a Cancel stops the work through `own`.
    this.active.delete(lock);
    first.batch.work = this.settle(work, first.batch, signal);
    return ok({ accepted: stateOf(first.batch, this.deps.clock.now().getTime()) });
  }

  /** RF-159: the end of the work after the request becomes the outcome of the batch; it never rejects. */
  private async settle(
    work: Promise<Result<UploadSummary, UploadProblem>>,
    batch: HeldBatch,
    signal: AbortSignal,
  ): Promise<void> {
    let outcome: BatchOutcome;
    try {
      const result = await work;
      outcome = result.ok
        ? { kind: 'stored', summary: result.value }
        : { kind: 'refused', error: new RosettaError(result.error) };
    } catch (error) {
      outcome = { kind: 'refused', error };
      await logBatchFailure(this.deps.logger, {
        ...{ error, signal, stopped: 'A zip being stored was stopped.' },
        unexpected: 'Storing a zip failed unexpectedly.',
      });
    }
    endBatch(batch, outcome, this.deps.clock.now().getTime());
  }

  /** Stops every upload in flight (server shutdown). */
  abortAll(): void {
    for (const upload of this.active.values()) upload.abort();
  }

  private async store(
    request: StoreUploadRequest,
    hooks: Hooks,
    upload: Upload,
  ): Promise<Result<UploadSummary, UploadProblem>> {
    const { projects, uploads, clock } = this.deps;
    const project = await projects.find(request.actor.userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    if (project.sourceKind !== 'upload') return err(ERROR_CODES.conflict);
    // RF-159: a zip being stored for this project is a batch at work; an earlier outcome goes.
    if (!(await this.deps.batches.claim(project.id))) return err(ERROR_CODES.uploadInProgress);
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
      ...hooks,
      onProgress: (progress) => {
        if (upload.batch !== undefined) upload.batch.progress = progress;
      },
    });
    const { batch } = upload;
    if (batch !== undefined) {
      // RF-159: cancelled after the store: nothing is attached; from here on a Cancel waits for the end.
      if (hooks.signal.aborted) return this.stopped(stored, hooks.signal);
      batch.attaching = true;
    }
    const done = { project, stored, fileName: name.value, uploadedAt };
    return withinAttachLimit(this.publish(request, done), this.deps.attachTimeoutMs);
  }

  /** The stored zip becomes the source of the project, with its audit rows (RF-128, RF-133). */
  private async publish(
    request: StoreUploadRequest,
    done: {
      readonly project: Project;
      readonly stored: StoredUpload;
      readonly fileName: string;
      readonly uploadedAt: Date;
    },
  ): Promise<Result<UploadSummary, UploadProblem>> {
    const { project, stored, fileName, uploadedAt } = done;
    const attached = await this.attach(project, stored, { fileName, uploadedAt });
    if (!attached) {
      // The project was deleted while the zip arrived: a snapshot it created has no owner.
      if (stored.created) await this.deps.uploads.remove(stored.key);
      return err(ERROR_CODES.notFound);
    }
    // RF-128: the same content was already stored; now that it is the source, the newest upload names it.
    // RF-159: the source is attached, so a step that fails from here on is logged and skipped.
    const { logger, uploads } = this.deps;
    const { userId } = request.actor;
    if (!stored.created) {
      await bestEffort(logger, 'the rename of the snapshot', () =>
        uploads.rewriteInfo(stored.key, stored.info),
      );
    }
    await bestEffort(logger, 'the removal of the earlier snapshot', () =>
      pruneEarlier(this.deps, project, stored.key),
    );
    const input = { userId, ip: request.ip, projectId: project.id };
    await bestEffort(logger, 'the audit rows of the zip', () =>
      recordUpload(this.deps, input, stored),
    );
    await bestEffort(logger, 'the audit rows of the workbooks', () =>
      recordWorkbooks(this.deps, {
        ...{ actor: request.actor, projectId: project.id, ip: request.ip },
        snapshotHash: stored.info.snapshotHash,
        workbooks: stored.info.workbooks ?? [],
      }),
    );
    return ok(summaryOf(stored, project, fileName, uploadedAt.toISOString()));
  }

  /**
   * RF-159: the batch was cancelled as its snapshot was stored. A snapshot this upload created is
   * nobody's source and goes; one it found already stored (the source, or a run's) stays untouched.
   */
  private async stopped(stored: StoredUpload, signal: AbortSignal): Promise<never> {
    if (stored.created) await this.deps.uploads.remove(stored.key);
    throw signal.reason instanceof Error ? signal.reason : new Error('The upload was stopped.');
  }

  /** Records the stored zip as the project's source; false when the project is gone. */
  private async attach(
    project: Project,
    stored: StoredUpload,
    sent: { readonly fileName: string; readonly uploadedAt: Date },
  ): Promise<boolean> {
    const workbooks = stored.info.workbooks?.length ?? 0;
    const attached = await this.deps.projects.attachUpload({
      userId: project.userId,
      projectId: project.id,
      upload: {
        ...{ fileName: sent.fileName, uploadedAt: sent.uploadedAt.getTime() },
        ...{ snapshotKey: stored.key, ...(workbooks === 0 ? {} : { workbooks }) },
      },
      updatedAt: sent.uploadedAt.getTime(),
    });
    return attached !== undefined;
  }
}
