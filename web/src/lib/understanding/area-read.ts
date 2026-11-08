import type { CoverageListing } from '../../api/coverage.js';
import type { CodeAreaInfo } from '../live-run/code-map-tiles.js';
import { COVERAGE_BAR } from './measure-text.js';

// RF-230, RF-231, UX-23 (P8-93): an area counts as read only when at least the coverage bar (the 80%
// of its first-party tokens the summary names) was read; below it the area is "partly read". The
// share is the one the run wrote in its coverage (`readShare` of the domain, library and generated
// files in none), so the page, the summary and the reader gate use one calculation. Until the
// coverage is known, or when it cannot be read or is an old file with no shares (also in part, for a
// resumed run of an older deploy), the page says no verdict.

/** What the page knows of how much of each area was read. */
export type AreaReading =
  | { readonly status: 'checking' }
  | { readonly status: 'unknown' }
  /** `partly`: the areas of own code read below the bar, with the share of each (0 to 1). */
  | { readonly status: 'known'; readonly partly: ReadonlyMap<string, number> };

/** Areas with nothing a reader could read are no part of the count (RF-243, RF-206). */
const NOTHING_TO_READ = ['no application logic', 'no readable file'];

type ListedArea = CoverageListing['areas'][number];

function countsAsArea(each: ListedArea, library: ReadonlySet<string>): boolean {
  if (library.has(each.area)) return false;
  return !NOTHING_TO_READ.some((note) => each.note?.includes(note) === true);
}

// RF-230
export function readingOf(
  listing: CoverageListing | undefined,
  failed: boolean,
  areas: readonly CodeAreaInfo[] | undefined,
): AreaReading {
  if (listing === undefined) return { status: failed ? 'unknown' : 'checking' };
  if (!listing.areas.some((each) => each.firstPartyShare !== undefined)) {
    return { status: 'unknown' };
  }
  const library = new Set((areas ?? []).filter((each) => each.thirdParty).map((each) => each.name));
  // RF-006 (P8-138): a resumed run of an older deploy restores areas with no share beside new ones.
  if (
    listing.areas.some((each) => each.firstPartyShare === undefined && countsAsArea(each, library))
  ) {
    return { status: 'unknown' };
  }
  const partly = new Map<string, number>();
  for (const each of listing.areas) {
    const share = each.firstPartyShare;
    if (share !== undefined && share < COVERAGE_BAR && countsAsArea(each, library)) {
      partly.set(each.area, share);
    }
  }
  return { status: 'known', partly };
}
