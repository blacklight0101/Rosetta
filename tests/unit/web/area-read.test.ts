import { describe, expect, it } from 'vitest';
import type { CoverageListing } from '../../../web/src/api/coverage.js';
import type { CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { partlyReadAreas } from '../../../web/src/lib/understanding/area-read.js';

// RF-230, RF-231 (P8-93, UX-23): an area is read only above the coverage bar (80% of its tokens, the
// bar the summary names); below it the area is "partly read". Library areas and areas with nothing to
// read are no part of the count.

const area = (name: string, readTokenShare: number, extra: object = {}) => ({
  area: name,
  files: [],
  tokens: 1000,
  readTokenShare,
  ...extra,
});

const listing = (...areas: CoverageListing['areas']): CoverageListing => ({ areas });

describe('partlyReadAreas', () => {
  it('RF-230 counts the areas read below the bar, the Asset Manager case of 16%', () => {
    const counted = partlyReadAreas(listing(area('Models', 0.16), area('Web', 0.16)), undefined);

    expect(counted).toBe(2);
  });

  it('RF-230 an area at the bar counts as read, one just under it as partly read', () => {
    const counted = partlyReadAreas(listing(area('A', 0.8), area('B', 0.7996), area('C', 1)), []);

    expect(counted).toBe(1);
  });

  it('RF-230 an area no reader started (share 0, noted not read) is partly read', () => {
    const counted = partlyReadAreas(listing(area('Late', 0, { note: 'not read' })), []);

    expect(counted).toBe(1);
  });

  it('RF-231 leaves out a library area, an area with no application logic and one without tokens', () => {
    const areas: readonly CodeAreaInfo[] = [
      { name: 'jQuery', estimatedTokens: 900, thirdParty: true },
    ];
    const counted = partlyReadAreas(
      listing(
        area('jQuery', 0),
        area('Vendor', 0.1, { note: 'no application logic' }),
        area('Images', 0, { tokens: 0 }),
        area('Binary', 0, { note: 'no readable file in the area (only binary or ignored files)' }),
        area('Models', 0.1),
      ),
      areas,
    );

    expect(counted).toBe(1);
  });

  it('RF-230 a listing written before the shares existed says nothing about the areas', () => {
    const old: CoverageListing = { areas: [{ area: 'Models', files: [] }] };

    expect(partlyReadAreas(old, [])).toBe(0);
  });
});
