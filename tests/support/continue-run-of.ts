import type { Clock } from '../../src/application/ports/clock.js';
import { ContinueRun } from '../../src/application/use-cases/continue-run.js';
import type { RunHarness } from './run-harness.js';

// RF-432: Continue (+N) over the run harness's stores and queue, as the composition root wires it.

export function continueRunOf(runs: RunHarness, clock: Clock): ContinueRun {
  return new ContinueRun({ runs: runs.runs, manifests: runs.manifests, queue: runs.queue, clock });
}
