import { describe, expect, it } from 'vitest';
import type { CoverageListing } from '../../../web/src/api/coverage.js';
import type { CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { percentText } from '../../../web/src/lib/understanding/measure-text.js';
import { readingOf, type AreaReading } from '../../../web/src/lib/understanding/area-read.js';

// RF-230, RF-231 (P8-93, UX-23): an area is read only above the coverage bar (80% of its first-party
// tokens, the bar the summary names); below it the area is "partly read". Library areas and areas
// with nothing to read are no part of it. Until the coverage is known, or when it cannot be, the page
// says no verdict.

const area = (name: string, firstPartyShare: number, extra: object = {}) => ({
  area: name,
  files: [],
  firstPartyShare,
  ...extra,
});

const listing = (...areas: CoverageListing['areas']): CoverageListing => ({ areas });

function partlyOf(reading: AreaReading): ReadonlyMap<string, number> {
  if (reading.status !== 'known') throw new Error(`The reading is ${reading.status}`);
  return reading.partly;
}

describe('readingOf', () => {
  it('RF-230 lists the areas read below the bar with their share, the Asset Manager case of 16%', () => {
    const reading = readingOf(listing(area('Models', 0.16), area('Web', 0.16)), false, undefined);

    expect([...partlyOf(reading)]).toEqual([
      ['Models', 0.16],
      ['Web', 0.16],
    ]);
  });

  it('RF-230 an area at the bar is read, one just under it is partly read', () => {
    const reading = readingOf(listing(area('A', 0.8), area('B', 0.7996), area('C', 1)), false, []);

    expect([...partlyOf(reading).keys()]).toEqual(['B']);
  });

  it('RF-230 an area no reader started (share 0, noted not read) is partly read', () => {
    const reading = readingOf(listing(area('Late', 0, { note: 'not read' })), false, []);

    expect([...partlyOf(reading).keys()]).toEqual(['Late']);
  });

  it('RF-231 leaves out a library area, an area with no application logic and one with nothing to read', () => {
    const areas: readonly CodeAreaInfo[] = [
      { name: 'jQuery', estimatedTokens: 900, thirdParty: true },
    ];
    const reading = readingOf(
      listing(
        area('jQuery', 0),
        area('Vendor', 0.1, { note: 'no application logic' }),
        area('Binary', 0, { note: 'no readable file in the area (only binary or ignored files)' }),
        area('Images', 1),
        area('Models', 0.1),
      ),
      false,
      areas,
    );

    expect([...partlyOf(reading).keys()]).toEqual(['Models']);
  });

  it('RF-230 says every area is read when all are above the bar: a known reading with none partly read', () => {
    const reading = readingOf(listing(area('A', 0.9), area('B', 1)), false, []);

    expect(partlyOf(reading).size).toBe(0);
  });
});

describe('readingOf, when the coverage is not there', () => {
  it('RF-230 is still checking while the coverage is being read', () => {
    expect(readingOf(undefined, false, [])).toEqual({ status: 'checking' });
  });

  it('RF-230 is unknown when the coverage cannot be read', () => {
    expect(readingOf(undefined, true, [])).toEqual({ status: 'unknown' });
  });

  it('RF-230 a listing written before the shares existed, or with no area, says nothing about the areas', () => {
    const old: CoverageListing = { areas: [{ area: 'Models', files: [] }] };

    expect(readingOf(old, false, [])).toEqual({ status: 'unknown' });
    expect(readingOf(listing(), false, [])).toEqual({ status: 'unknown' });
  });
});

describe('percentText', () => {
  it('RF-231 reads the shares of the listing as whole percents without losing one to rounding noise', () => {
    expect(['0.16', '0.29', '0.57', '0.58'].map((share) => percentText(Number(share)))).toEqual([
      '16%',
      '29%',
      '57%',
      '58%',
    ]);
  });
});

describe('readingOf a resumed old run (P8-138)', () => {
  it('RF-230 RF-006 gives no verdict for a resumed old run whose restored areas have no share', () => {
    // P8-138: an area restored from the session before the resume has no share; it is not read.
    const restored = { area: 'Restored', files: [] };
    const reading = readingOf(listing(restored, area('Web', 0.9)), false, []);

    expect(reading).toEqual({ status: 'unknown' });
  });
});
