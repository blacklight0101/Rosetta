import { createContext } from 'preact';
import type { CoverageListing } from '../api/coverage.js';
import type { CodeAreaInfo } from '../lib/live-run/code-map-tiles.js';
import type { AreaReading } from '../lib/understanding/area-read.js';

// RF-230, RF-231, RF-1016 (P8-93): what the page of an understand run knows of its areas, read once
// for the whole page: the areas of the code map, the run's coverage and what the coverage says of how
// much of each area was read. The header badge, the Areas figure, the code map and the Read step all
// take it from here, so they agree. Outside a run page nothing is known yet.

export interface AreaReadState {
  readonly areas: readonly CodeAreaInfo[] | undefined;
  readonly coverage: CoverageListing | undefined;
  readonly reading: AreaReading;
}

export const AreaReadContext = createContext<AreaReadState>({
  areas: undefined,
  coverage: undefined,
  reading: { status: 'checking' },
});
