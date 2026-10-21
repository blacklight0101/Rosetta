import { describe, expect, it } from 'vitest';
import type { CoverageListing } from '../../../web/src/api/coverage.js';
import type { CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { coverageOf } from '../../../web/src/lib/live-run/coverage-map.js';
import { ev, planned, startedData, stateAfter } from './live-run-fixtures.js';

// RF-208, Q-43, RF-230: the coverage of a run that retries the failed areas lists the cards and
// coverage it holds from the run it retries, but counts only the areas it reads again as its own
// work; the held areas are listed apart as not in this run, and are not counted in its totals.

const read = [{ startLine: 1, endLine: 40 }];
const known: readonly CodeAreaInfo[] = ['Catalog', 'Models', 'Services'].map((name, index) => ({
  ...{ name, estimatedTokens: 100, thirdParty: false },
  files: index + 2,
}));

/** The listing the retry wrote: Catalog read again (one file of two), Models and Services held. */
const listing: CoverageListing = {
  areas: [
    {
      area: 'Catalog',
      files: [
        { path: 'Catalog/Edit.cs', read },
        { path: 'Catalog/List.cs', read: [] },
      ],
    },
    { area: 'Models', files: [{ path: 'Models/Item.cs', read }] },
    { area: 'Services', files: [{ path: 'Services/Pay.cs', read }] },
  ],
};

const retryStarted = ev(2, 'retry.started', {
  ...{ parentRunId: 'p-1', parentRunKey: '20261012-090000-understand', areas: 1 },
  seeded: { cards: 2, claims: 2, supported: 2 },
});

describe('the coverage of a retry', () => {
  it('RF-208 counts only the areas it reads again and lists the held ones apart', () => {
    const retried = stateAfter(
      ...[ev(1, 'run.started', startedData), retryStarted],
      planned(3, 'reader-001', 'Catalog'),
    );

    const map = coverageOf(retried, listing, known);

    expect(map.areas.map((each) => each.area)).toEqual(['Catalog']);
    expect(map.notInRun.map((each) => each.area)).toEqual(['Models', 'Services']);
    expect([map.filesRead, map.filesTotal]).toEqual([1, 2]);
  });

  it('RF-230 a run that retries nothing lists every area its coverage names, as before', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Catalog'));

    const map = coverageOf(state, listing, known);

    expect(map.areas.map((each) => each.area)).toEqual(['Catalog', 'Models', 'Services']);
    expect(map.notInRun).toEqual([]);
  });
});
