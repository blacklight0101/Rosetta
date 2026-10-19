import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isRunEnded } from '../../domain/runs/run-event.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunEventHistory } from '../ports/run-events.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-615, RF-614, RNF-004: what the journey reads of a run beyond its row: the understand run a plan
// run was written from (its manifest) and the error code the run ended with (its last event).

/**
 * The folder name of the understand run a plan run was written from; null when the manifest names
 * none (a run from before the field, or one that stopped before it had a source) or cannot be read.
 * A damaged manifest must not take the whole journey down, so it only leaves that run unplaced.
 */
// RF-614
export async function planSourceKey(
  manifests: Pick<RunManifestStore, 'read'>,
  run: Run,
): Promise<string | null> {
  try {
    return (await manifests.read(scopeOf(run)))?.sourceRunId ?? null;
  } catch (error) {
    if (error instanceof RosettaError) return null;
    throw error;
  }
}

/** The `RST` code in the `run.ended` event that closes the log of the run; null when it has none. */
// RF-615
export async function endCodeOf(
  history: Pick<RunEventHistory, 'read' | 'lastSeq'>,
  run: Run,
): Promise<string | null> {
  if (run.queueState !== 'Ended' || run.endState === 'Completed') return null;
  const scope = scopeOf(run);
  const last = await history.lastSeq(scope);
  if (last === 0) return null;
  const closing = (await history.read(scope, last - 1)).find(isRunEnded);
  const code = closing?.data['errorCode'];
  return typeof code === 'string' ? code : null;
}
