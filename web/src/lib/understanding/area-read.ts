import type { CoverageListing } from '../../api/coverage.js';
import type { CodeAreaInfo } from '../live-run/code-map-tiles.js';
import { COVERAGE_BAR } from './measure-text.js';

// RF-230, RF-231, UX-23 (P8-93): an area counts as read only when at least the coverage bar (the 80%
// of its tokens the summary names) was read; below it the area is "partly read". It works from the
// run's coverage listing, so an area every reader started but read 16% of is not called read.

/** Areas with nothing a reader could read are no part of the count (RF-243, RF-206). */
const NOTHING_TO_READ = ['no application logic', 'no readable file'];

function countsAsArea(
  each: CoverageListing['areas'][number],
  library: ReadonlySet<string>,
): boolean {
  if (library.has(each.area) || (each.tokens ?? 0) === 0) return false;
  return !NOTHING_TO_READ.some((note) => each.note?.includes(note) === true);
}

/**
 * How many areas of own code were read below the bar, an area no reader started (share 0) among
 * them. A listing written before the shares existed says nothing, so no area counts from it.
 */
export function partlyReadAreas(
  listing: CoverageListing,
  areas: readonly CodeAreaInfo[] | undefined,
): number {
  const library = new Set((areas ?? []).filter((each) => each.thirdParty).map((each) => each.name));
  return listing.areas.filter(
    (each) =>
      each.readTokenShare !== undefined &&
      countsAsArea(each, library) &&
      each.readTokenShare < COVERAGE_BAR,
  ).length;
}
