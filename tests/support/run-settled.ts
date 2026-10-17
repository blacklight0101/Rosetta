import { vi } from 'vitest';
import { scopeOf } from '../../src/application/runs/run-scope.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { RunHarness } from './run-harness.js';

// RF-006: a run is settled when its row says it ended and `run.ended` closed its event log. The
// queue writes the manifest end between the two, so a test that acts on the ended run (Resume)
// waits for the last event, as a person looking at the page does.
export async function settledRun(harness: RunHarness, run: Run): Promise<Run> {
  const ended = await harness.ended(run);
  await vi.waitFor(
    async () => {
      const events = await harness.events.read(scopeOf(ended), 0);
      if (events.at(-1)?.type !== 'run.ended') throw new Error('The run has not closed its log');
    },
    { interval: 2 },
  );
  return ended;
}
