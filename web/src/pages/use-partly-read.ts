import { partlyReadAreas } from '../lib/understanding/area-read.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { useCodeAreas } from './use-code-areas.js';
import { endedAgents, useRunCoverage } from './use-run-coverage.js';

// RF-230, RF-231 (P8-93): how many areas of an ended understand run were read below the coverage
// bar, from the run's coverage and the library areas of its code map. Undefined until the coverage
// is known (and for a run with none), so the page says only what it knows.

// RF-230
export function usePartlyRead(
  run: { readonly id: string; readonly projectId: string },
  stage: string,
  state: RunState,
): number | undefined {
  const areas = useCodeAreas(run.projectId, stage);
  const listing = useRunCoverage(run.id, stage, endedAgents(state));
  return listing === undefined ? undefined : partlyReadAreas(listing, areas);
}
