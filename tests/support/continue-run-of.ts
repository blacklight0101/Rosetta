import type { Clock } from '../../src/application/ports/clock.js';
import type { JourneyRecords } from '../../src/application/ports/journey-records.js';
import { ContinueRun } from '../../src/application/use-cases/continue-run.js';
import type { RunHarness } from './run-harness.js';

// RF-432: Continue (+N) over the run harness's stores and queue, as the composition root wires it.

/** RF-011, RF-435: the journey records a test server's starts and Continue use; none by default. */
export interface JourneyGiven {
  readonly journeys?: JourneyRecords | undefined;
}

/** The journey records as a dependency of a use case: absent when the test gave none. */
export function journeysOf(given: JourneyGiven): { readonly journeys?: JourneyRecords } {
  return given.journeys === undefined ? {} : { journeys: given.journeys };
}

export function continueRunOf(
  runs: RunHarness,
  clock: Clock,
  given: JourneyGiven = {},
): ContinueRun {
  const { runs: index, manifests, queue } = runs;
  return new ContinueRun({ runs: index, manifests, queue, clock, ...journeysOf(given) });
}
