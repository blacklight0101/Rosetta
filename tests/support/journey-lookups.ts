import type { JourneyFigures, JourneyLookup } from '../../src/application/runs/approved-journey.js';
import { StartRun, type StartRunDependencies } from '../../src/application/use-cases/start-run.js';

// RF-430, RF-432: the server's journey estimate as a start sees it, for tests without a code map.

/** No journey estimate: a start that names a shown figure is refused (RST-2310). */
export const noJourney: JourneyLookup = () => Promise.resolve(undefined);

/** A fixed journey estimate. */
export function journeyOf(figures: JourneyFigures): JourneyLookup {
  return () => Promise.resolve(figures);
}

/** The journey the tests' server estimates: 2,600,000 tokens likely, 3,900,000 at worst, $0. */
export const serverJourney: JourneyFigures = {
  likely: { tokens: 2_600_000, costMicros: 0 },
  worstCase: { tokens: 3_900_000, costMicros: 0 },
};

/** RF-432: Start run over the tests' server journey. */
export function startRunOf(deps: Omit<StartRunDependencies, 'journey'>): StartRun {
  return new StartRun({ ...deps, journey: journeyOf(serverJourney) });
}
