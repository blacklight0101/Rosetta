import { isRunEnded } from '../../domain/runs/run-event.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunEventHistory } from '../ports/run-events.js';
import { scopeOf } from '../runs/run-scope.js';

// RF-615, RNF-004, P8-139: the error code a run ended with, as its last event says; the backfill of
// the stored journey facts reads it (the plan source is read in journey-file-facts.ts).

/** The `RST` code in the `run.ended` event that closes the log of the run; null when it has none. */
// RF-615
export async function endCodeOf(
  history: Pick<RunEventHistory, 'read' | 'lastSeq'>,
  run: Run,
): Promise<string | null> {
  if (run.queueState !== 'Ended') return null;
  const scope = scopeOf(run);
  const last = await history.lastSeq(scope);
  const closing = (await history.read(scope, Math.max(last - 1, 0))).find(isRunEnded);
  const code = closing?.data['errorCode'];
  return typeof code === 'string' ? code : null;
}
