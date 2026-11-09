import { describe, expect, it } from 'vitest';
import { COVERAGE_BAR, partlyReadAreas } from '../../../../src/domain/cards/partly-read.js';

// RF-230, RF-231, DEC-220 (P8-130): the areas of a run read below the coverage bar, counted from the
// areas of `coverage.json` the way the run page counts them.

describe('partlyReadAreas', () => {
  it('RF-230 the coverage bar is the 80% of RF-231, not the 50% at which readers ask for more', () => {
    expect(COVERAGE_BAR).toBe(0.8);
  });

  it('RF-230 counts the areas whose first-party share is below the bar and no others', () => {
    const areas = [
      { area: 'x', firstPartyShare: 0.16 },
      { area: 'x', firstPartyShare: 0.79 },
      { area: 'x', firstPartyShare: 0.8 },
      { area: 'x', firstPartyShare: 1 },
    ];

    expect(partlyReadAreas(areas)).toBe(2);
  });

  it('RF-230 counts an area read at 60% as partly read: the readers bar of 50% is another threshold', () => {
    expect(partlyReadAreas([{ area: 'x', firstPartyShare: 0.6 }])).toBe(1);
  });

  it('RF-230 counts nothing for an old file whose areas have no share', () => {
    expect(partlyReadAreas([{ area: 'x' }, { area: 'y', note: 'x' }])).toBe(0);
  });

  it('RF-230 leaves out an area with no application logic or no readable file', () => {
    const areas = [
      { area: 'x', firstPartyShare: 0, note: 'no application logic' },
      { area: 'x', firstPartyShare: 0, note: 'skipped: no readable file' },
      { area: 'x', firstPartyShare: 0.1 },
    ];

    expect(partlyReadAreas(areas)).toBe(1);
  });

  it('RF-230 leaves out an area the code map calls third-party, as the run page does (P8-130)', () => {
    const areas = [
      { area: 'Scripts', firstPartyShare: 0.1 },
      { area: 'src', firstPartyShare: 0.1 },
    ];

    expect(partlyReadAreas(areas, new Set(['Scripts']))).toBe(1);
    expect(partlyReadAreas(areas)).toBe(2);
  });
});

describe('partlyReadAreas of a resumed old run (P8-138)', () => {
  it('RF-230 RF-006 counts nothing for a resumed old run whose restored areas have no share', () => {
    // P8-138: the tasks of the session before the resume kept their coverage without a share, so the
    // areas read again carry one and the restored ones do not; the listing is as unknown as an old file.
    const areas = [{ area: 'restored' }, { area: 'read again', firstPartyShare: 0.16 }];

    expect(partlyReadAreas(areas)).toBe(0);
  });
});
