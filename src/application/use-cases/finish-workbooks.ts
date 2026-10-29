import type { Actor } from '../../domain/accounts/actor.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Clock } from '../ports/clock.js';
import type { WorkbookProgress, WorkbookStaging } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';
import { withinAttachLimit } from './attach-limit.js';
import { logBatchFailure } from './batch-failure-log.js';
import { attachWorkbooks, summaryOfBatch, type AttachDependencies } from './attach-workbooks.js';
import { settleLate, type LateAttach } from './late-attach.js';
import { endBatch, type BatchOutcome, type HeldBatch } from './workbook-batch-state.js';
import type {
  BatchProblem,
  FinishBatchRequest,
  WorkbookBatchSummary,
} from './workbook-batch-types.js';

// RF-150, RF-158, RF-159, DEC-183: the work after the finish was accepted. A workbook batch is read,
// rendered and published and becomes the source of the project, or it ends with the error that stopped
// it. Nothing is thrown: a refusal and an error nobody expected both end up in the outcome, and the
// second is logged as well, so an error after the request is never lost (RF-158).

export interface FinishDependencies extends AttachDependencies {
  readonly staging: WorkbookStaging;
}

interface FinishWork {
  readonly batchId: string;
  readonly actor: Actor;
  readonly ip: string;
  readonly project: Project;
  readonly signal: AbortSignal;
  /** Told where the work has got to (RF-159). */
  readonly onProgress: (progress: WorkbookProgress) => void;
  /** Told when the source is being attached: from here on a cancel can no longer stop it. */
  readonly onAttach?: () => void;
  /** Told when the attach passed its time limit and goes on (RF-159). */
  readonly onLate?: (late: LateAttach<WorkbookBatchSummary, BatchProblem>) => void;
}

/** Nothing of a batch that failed stays staged; an error nobody expected is logged. */
async function failed(
  deps: FinishDependencies,
  batchId: string,
  failure: { readonly error: unknown; readonly signal: AbortSignal },
): Promise<void> {
  try {
    await deps.staging.discard(batchId);
  } catch (discardError) {
    await report(
      deps,
      'The staging of a failed workbook batch could not be deleted.',
      discardError,
    );
  }
  await logBatchFailure(deps.logger, {
    ...failure,
    batchId,
    stopped: 'A workbook batch was stopped.',
    unexpected: 'Finishing a workbook batch failed unexpectedly.',
  });
}

function report(deps: FinishDependencies, message: string, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : 'unknown';
  return deps.logger.log({ ...{ level: 'error', logger: 'sources', message }, data: { reason } });
}

// RF-159
async function finishWorkbooks(deps: FinishDependencies, work: FinishWork): Promise<BatchOutcome> {
  const { batchId, actor, ip, project, signal, onProgress, onAttach, onLate } = work;
  try {
    const uploadedAt = deps.clock.now();
    const published = await deps.staging.publish(batchId, {
      ...{ projectId: project.id, uploadedAt: uploadedAt.toISOString(), signal, onProgress },
    });
    if (signal.aborted) {
      // Cancelled after the publish: nothing is attached (RF-159). A snapshot this batch created is
      // nobody's and goes; one it found already stored (the source, or a run's) stays untouched.
      if (published.created) await deps.uploads.remove(published.key);
      return { kind: 'refused', error: signal.reason };
    }
    onAttach?.();
    const attach = attachWorkbooks(deps, { actor, ip, project, published, uploadedAt });
    const { key, created } = published;
    const summary = (): WorkbookBatchSummary => summaryOfBatch(project, published, uploadedAt);
    const attached = await withinAttachLimit(attach, deps.attachTimeoutMs, () => {
      onLate?.({ ...{ attach, project, key, created }, summary });
    });
    return attached.ok
      ? { kind: 'stored', summary: attached.value }
      : { kind: 'refused', error: new RosettaError(attached.error) };
  } catch (error) {
    await failed(deps, batchId, { error, signal });
    return { kind: 'refused', error };
  }
}

/**
 * RF-159: the last resort of the work after the request, so the batch never stays at work: the error is
 * the outcome, and it is logged if the log can take it.
 */
async function refusedAnyway(deps: FinishDependencies, error: unknown): Promise<BatchOutcome> {
  try {
    await report(deps, 'The work on a workbook batch failed unexpectedly.', error);
  } catch {
    // The log is down as well: the outcome still ends the batch.
  }
  return { kind: 'refused', error };
}

/** RF-159: the work after the request; it never rejects, its outcome is kept on the batch. */
export async function runFinish(
  deps: FinishDependencies & { readonly clock: Clock },
  input: {
    readonly request: FinishBatchRequest;
    readonly project: Project;
    readonly batch: HeldBatch;
    readonly signal: AbortSignal;
  },
): Promise<void> {
  const { request, project, batch, signal } = input;
  const outcome = await finishWorkbooks(deps, {
    ...{ batchId: batch.id, actor: request.actor, ip: request.ip, project, signal },
    onProgress: (progress) => {
      batch.progress = progress;
    },
    onAttach: () => {
      batch.attaching = true;
    },
    onLate: (late) => {
      batch.late = settleLate(deps, batch, late);
    },
  }).catch((error: unknown) => refusedAnyway(deps, error));
  endBatch(batch, outcome, deps.clock.now().getTime());
}
