import { readingOf } from '../lib/understanding/area-read.js';
import type { RunState } from '../lib/live-run/run-state.js';
import type { AreaReadState } from './area-read-context.js';
import { useCodeAreas } from './use-code-areas.js';
import { endedAgents, useRunCoverage } from './use-run-coverage.js';

// RF-230, RF-231, RF-1016 (P8-93): reads the areas of the code map and the run's coverage once and
// says how much of each area was read. A run that is not an understand run has no coverage, and
// says so rather than checking for ever.

// RF-230
export function useAreaRead(
  run: { readonly id: string; readonly projectId: string },
  stage: string,
  state: RunState,
): AreaReadState {
  const areas = useCodeAreas(run.projectId, stage);
  const load = useRunCoverage(run.id, stage, endedAgents(state));
  const coverage = load.status === 'ready' ? load.listing : undefined;
  const reading =
    stage === 'understand'
      ? readingOf(coverage, load.status === 'failed', areas)
      : ({ status: 'unknown' } as const);
  return { areas, coverage, reading };
}
