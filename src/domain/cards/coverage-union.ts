/* eslint-disable @typescript-eslint/no-unused-vars -- stubs until the feat commit fills them */
import type { AreaCoverage, CoverageArea, CoverageFile } from './area-coverage.js';

// RF-230, RF-209: the coverage of a run whose areas were read by more than one task (a Deepen reads
// the cited files of rejected claims and the files no task read again). The lines read of a file
// are the union of every task's, and each area of the run is listed once, in the order the
// entries first name it, with what its first entry says about it (a failure, a note, its flows
// and screens).

// RF-230
export function unionCoverage(
  entries: readonly AreaCoverage[],
  areas: readonly CoverageArea[],
  files: readonly CoverageFile[],
): readonly AreaCoverage[] {
  return entries;
}
