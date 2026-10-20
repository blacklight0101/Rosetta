import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { CoverageListing } from '../../../web/src/api/coverage.js';
import type { CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { coverageOf } from '../../../web/src/lib/live-run/coverage-map.js';
import { CoverageMap } from '../../../web/src/pages/CoverageMap.js';
import { planned, stateAfter } from './live-run-fixtures.js';

// RF-230 (DEC-158), RF-231: a run over some of the areas lists the areas it was not asked to read apart,
// as "not in this run", and counts them neither as not read nor in the totals. A run over every area has
// no such section. An area the run did plan stays counted as it was (live-coverage-unread.test.tsx).

afterEach(cleanup);

const read = [{ startLine: 1, endLine: 40 }];

const areaNames = ['Catalog', 'Models', 'Reports', 'Billing', 'Admin'] as const;
const known: readonly CodeAreaInfo[] = [
  ...areaNames.map((name, index) => ({
    name,
    estimatedTokens: 100,
    thirdParty: false,
    files: index + 2,
  })),
  { name: 'jQuery', estimatedTokens: 900, thirdParty: true, files: 30 },
];

/** The listing a run over Catalog (one file read of two) and Models (nothing read) wrote. */
const twoAreas: CoverageListing = {
  areas: [
    {
      area: 'Catalog',
      files: [
        { path: 'Catalog/Edit.cs', read },
        { path: 'Catalog/List.cs', read: [] },
      ],
    },
    { area: 'Models', files: [{ path: 'Models/Item.cs', read: [] }], note: 'not read' },
  ],
};

const overTwo = () =>
  stateAfter(planned(1, 'reader-001', 'Catalog'), planned(2, 'reader-002', 'Models'));

const overAll = () =>
  stateAfter(
    ...areaNames.map((name, index) => planned(index + 1, `reader-00${String(index + 1)}`, name)),
  );

describe('the areas of a run over 2 of 5 areas', () => {
  it('RF-230 lists the 3 areas the run was not asked to read apart, in code map order', () => {
    const map = coverageOf(overTwo(), twoAreas, known);

    expect(map.notInRun).toEqual([
      { area: 'Reports', files: 4 },
      { area: 'Billing', files: 5 },
      { area: 'Admin', files: 6 },
    ]);
  });

  it('RF-230 keeps them out of the areas, so they are not counted as not read', () => {
    const map = coverageOf(overTwo(), twoAreas, known);

    expect(map.areas.map((each) => each.area)).toEqual(['Catalog', 'Models']);
  });

  it('RF-230 keeps their files out of the total of files', () => {
    const map = coverageOf(overTwo(), twoAreas, known);

    expect([map.filesRead, map.filesTotal]).toEqual([1, 3]);
  });

  it('RF-231 never lists a third-party area as not in this run', () => {
    const map = coverageOf(overTwo(), twoAreas, known);

    expect(map.notInRun.map((each) => each.area)).not.toContain('jQuery');
  });
});

describe('the page of a run over 2 of 5 areas', () => {
  it('RF-230 says on the page: 2 areas, 1 not read, and a section "Not in this run" with the 3 names', () => {
    render(<CoverageMap state={overTwo()} coverage={twoAreas} areas={known} />);

    const region = screen.getByRole('region', { name: 'Coverage map' });
    expect(region.textContent).toContain('1 of 3 files read in 1 area · 1 area not read');
    const apart = within(region).getByRole('region', { name: 'Not in this run' });
    expect(apart.textContent).toContain('Not in this run');
    for (const name of ['Reports', 'Billing', 'Admin']) expect(apart.textContent).toContain(name);
    expect(apart.textContent).not.toContain('Catalog');
    expect(apart.textContent).not.toContain('not read');
  });

  it('RF-230 shows no coverage block for an area that is not in the run', () => {
    render(<CoverageMap state={overTwo()} coverage={twoAreas} areas={known} />);

    const region = screen.getByRole('region', { name: 'Coverage map' });
    expect(within(region).queryByRole('region', { name: 'Coverage of Reports' })).toBeNull();
    expect(within(region).getByRole('region', { name: 'Coverage of Models' })).toBeTruthy();
  });

  it('RF-230 shows the area name as text', () => {
    const odd: readonly CodeAreaInfo[] = [
      ...known,
      { name: '<b>Evil</b>', estimatedTokens: 1, thirdParty: false, files: 1 },
    ];

    render(<CoverageMap state={overTwo()} coverage={twoAreas} areas={odd} />);

    const apart = screen.getByRole('region', { name: 'Not in this run' });
    expect(apart.textContent).toContain('<b>Evil</b>');
    expect(apart.querySelector('b')).toBeNull();
  });
});

describe('the areas of a run over every area', () => {
  const all: CoverageListing = {
    areas: areaNames.map((area) => ({ area, files: [{ path: `${area}/a.cs`, read }] })),
  };

  it('RF-230 has no "not in this run" section', () => {
    render(<CoverageMap state={overAll()} coverage={all} areas={known} />);

    const region = screen.getByRole('region', { name: 'Coverage map' });
    expect(region.textContent).not.toContain('Not in this run');
    expect(within(region).queryByRole('region', { name: 'Not in this run' })).toBeNull();
    expect(coverageOf(overAll(), all, known).notInRun).toEqual([]);
  });

  it('RF-230 still lists a planned area that has no entry yet, with the count of its files, as not read', () => {
    const early: CoverageListing = { areas: [all.areas[0] ?? { area: 'Catalog', files: [] }] };

    const map = coverageOf(overAll(), early, known);

    expect(map.notInRun).toEqual([]);
    const admin = map.areas.find((each) => each.area === 'Admin');
    expect([admin?.filesRead, admin?.filesTotal]).toEqual([0, 6]);
  });
});

describe('a run whose selection is not known yet', () => {
  it('RF-230 lists no area as not in this run before any agent is planned or any file listed', () => {
    const map = coverageOf(stateAfter(), { areas: [] }, known);

    expect(map.notInRun).toEqual([]);
  });

  it('RF-1005 lists no area as not in this run without a listing', () => {
    const map = coverageOf(overTwo(), undefined, known);

    expect(map.notInRun).toEqual([]);
  });
});

describe('a Deepen over a subset', () => {
  it('RF-230 counts an area the parent run read as in this run even if no agent of the Deepen touched it', () => {
    const state = stateAfter(planned(1, 'reader-003', 'Catalog'));

    const map = coverageOf(state, twoAreas, known);

    expect(map.areas.map((each) => each.area)).toEqual(['Catalog', 'Models']);
    expect(map.notInRun.map((each) => each.area)).toEqual(['Reports', 'Billing', 'Admin']);
  });
});
