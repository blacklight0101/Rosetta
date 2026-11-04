import type { CoverageListing } from '../../api/coverage.js';
import type { CodeAreaInfo } from '../live-run/code-map-tiles.js';

// RF-230, RF-231, UX-23 (P8-93): an area counts as read only when at least the coverage bar (the 80%
// of its first-party tokens the summary names) was read; below it the area is "partly read".

/** What the page knows of how much of each area was read. */
export type AreaReading =
  | { readonly status: 'checking' }
  | { readonly status: 'unknown' }
  | { readonly status: 'known'; readonly partly: ReadonlyMap<string, number> };

// RF-230
export function readingOf(
  listing: CoverageListing | undefined,
  failed: boolean,
  areas: readonly CodeAreaInfo[] | undefined,
): AreaReading {
  return {
    status: listing === undefined && failed && areas === undefined ? 'unknown' : 'checking',
  };
}
