import type { Actor } from '../../domain/accounts/actor.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { WorkbookProgress, WorkbookStaging } from '../ports/workbook-staging.js';
import type { Project } from '../projects/project.js';
import { attachWorkbooks, type AttachDependencies } from './attach-workbooks.js';
import type { BatchOutcome } from './workbook-batch-state.js';

// RF-150, RF-158, RF-159, DEC-183: the work after the finish was accepted. A workbook batch is read,
// rendered and published and becomes the source of the project, or it ends with the error that stopped
// it. Nothing is thrown: a refusal and an error nobody expected both end up in the outcome, and the
// second is logged as well, so an error after the request is never lost (RF-158).

export interface FinishDependencies extends AttachDependencies {
  readonly staging: WorkbookStaging;
}

export interface FinishWork {
  readonly batchId: string;
  readonly actor: Actor;
  readonly ip: string;
  readonly project: Project;
  readonly signal: AbortSignal;
  /** Told where the work has got to (RF-159). */
  readonly onProgress: (progress: WorkbookProgress) => void;
}

/** Nothing of a batch that failed stays staged; an error nobody expected is logged. */
async function failed(deps: FinishDependencies, batchId: string, error: unknown): Promise<void> {
  try {
    await deps.staging.discard(batchId);
  } catch (discardError) {
    await report(
      deps,
      'The staging of a failed workbook batch could not be deleted.',
      discardError,
    );
  }
  if (!(error instanceof RosettaError)) {
    await report(deps, 'Finishing a workbook batch failed unexpectedly.', error);
  }
}

function report(deps: FinishDependencies, message: string, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : 'unknown';
  return deps.logger.log({ ...{ level: 'error', logger: 'sources', message }, data: { reason } });
}

// RF-159
export async function finishWorkbooks(
  deps: FinishDependencies,
  work: FinishWork,
): Promise<BatchOutcome> {
  const { batchId, actor, ip, project, signal, onProgress } = work;
  try {
    const uploadedAt = deps.clock.now();
    const published = await deps.staging.publish(batchId, {
      ...{ projectId: project.id, uploadedAt: uploadedAt.toISOString(), signal, onProgress },
    });
    if (signal.aborted) {
      // Cancelled after the publish: the snapshot is nobody's source, so nothing is attached (RF-159).
      await deps.uploads.remove(published.key);
      return { kind: 'refused', error: signal.reason };
    }
    const attached = await attachWorkbooks(deps, { actor, ip, project, published, uploadedAt });
    return attached.ok
      ? { kind: 'stored', summary: attached.value }
      : { kind: 'refused', error: new RosettaError(attached.error) };
  } catch (error) {
    await failed(deps, batchId, error);
    return { kind: 'refused', error };
  }
}
