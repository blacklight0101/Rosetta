import { cleanup, render, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { CoverageListing } from '../../../web/src/api/coverage.js';
import {
  coverageOf,
  type AreaCoverage,
  type CoverageNode,
} from '../../../web/src/lib/live-run/coverage-map.js';
import type { CodeAreaInfo } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { CoverageMap } from '../../../web/src/pages/CoverageMap.js';
import {
  ev,
  planned,
  startedData,
  stateAfter,
  toolCalled,
  toolResult,
} from './live-run-fixtures.js';

// RF-230, RF-1005 (P3-61): the coverage map lists every file of every area, as read or not read,
// and an area the run asked an agent to read, but nobody did, is listed with its files as not read.
// An area the run was not asked to read is apart (live-coverage-not-in-run.test.tsx).

afterEach(cleanup);

const read = [{ startLine: 1, endLine: 40 }];

const listing: CoverageListing = {
  areas: [
    {
      area: 'Catalog',
      files: [
        { path: 'Catalog/Edit.cs', read },
        { path: 'Catalog/Views/Index.aspx', read: [] },
        { path: 'Catalog/List.cs', read: [] },
      ],
    },
    {
      area: 'Models',
      files: [
        { path: 'Models/Item.cs', read: [] },
        { path: 'Models/Order.cs', read: [] },
      ],
      note: 'not read',
    },
  ],
};

const known: readonly CodeAreaInfo[] = [
  { name: 'Catalog', estimatedTokens: 100, thirdParty: false, files: 3 },
  { name: 'Models', estimatedTokens: 50, thirdParty: false, files: 2 },
  { name: 'Reports', estimatedTokens: 40, thirdParty: false, files: 7 },
  { name: 'jQuery', estimatedTokens: 900, thirdParty: true, files: 30 },
];

/** A `read_file` call of the task and its answer. */
const readEvents = (seq: number, task: string, path: string) => [
  toolCalled(seq, task, { path, startLine: 1, endLine: 20 }),
  toolResult(seq + 1, task, true),
];

/** DEC-158: a run asked to read Catalog and Reports; a code map area with no reader is not in it. */
const catalogAndReports = () =>
  stateAfter(planned(1, 'reader-001', 'Catalog'), planned(2, 'reader-002', 'Reports'));

const flat = (nodes: readonly CoverageNode[]): readonly CoverageNode[] =>
  nodes.flatMap((node) => [node, ...flat(node.children)]);
const files = (area: AreaCoverage | undefined): readonly (readonly [string, boolean])[] =>
  flat(area?.tree ?? [])
    .filter((node) => node.kind === 'file')
    .map((node) => [node.path, node.read]);

describe('the files of the coverage map', () => {
  it('RF-230 lists every file of an area as read or not read, not only the files read', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Catalog'));

    const [catalog] = coverageOf(state, listing, known).areas;

    expect(files(catalog)).toEqual([
      ['Catalog/Views/Index.aspx', false],
      ['Catalog/Edit.cs', true],
      ['Catalog/List.cs', false],
    ]);
    expect([catalog?.filesRead, catalog?.filesTotal]).toEqual([1, 3]);
  });

  it('RF-230 counts a file as read when the live events say so before the listing does', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      ...readEvents(2, 'reader-001', 'Catalog/List.cs'),
    );

    const [catalog] = coverageOf(state, listing, known).areas;

    expect(files(catalog)).toContainEqual(['Catalog/List.cs', true]);
    expect(catalog?.filesRead).toBe(2);
  });
});

describe('the areas of the coverage map', () => {
  it('RF-230 lists an area no agent read, with its files as not read', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Catalog'));

    const models = coverageOf(state, listing, known).areas.find((each) => each.area === 'Models');

    expect(files(models)).toEqual([
      ['Models/Item.cs', false],
      ['Models/Order.cs', false],
    ]);
    expect([models?.filesRead, models?.filesTotal, models?.note]).toEqual([0, 2, 'not read']);
  });

  it('RF-230 lists an area of the code map that has no entry yet, with the count of its files', () => {
    const state = catalogAndReports();

    const map = coverageOf(state, listing, known);

    const reports = map.areas.find((each) => each.area === 'Reports');
    expect([reports?.filesRead, reports?.filesTotal, reports?.tree]).toEqual([0, 7, []]);
    expect(map.areas.map((each) => each.area)).not.toContain('jQuery');
  });

  it('RF-1005 lists only the areas with agents until the run has answered with its listing', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Catalog'));

    const map = coverageOf(state, undefined, known);

    expect(map.areas.map((each) => each.area)).toEqual(['Catalog']);
  });

  it('RF-1005 keeps the map of the reads alone when the run has no listing', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      planned(2, 'reader-001', 'Catalog'),
      ...readEvents(3, 'reader-001', 'Catalog/Edit.cs'),
    );

    const map = coverageOf(state);

    expect(map.areas.map((each) => [each.area, each.filesRead, each.filesTotal])).toEqual([
      ['Catalog', 1, undefined],
    ]);
    expect(map.filesTotal).toBeUndefined();
  });
});

const library: CoverageListing = {
  areas: [
    ...listing.areas,
    {
      area: 'jQuery',
      files: [
        { path: 'Scripts/jquery.js', read: [] },
        { path: 'Scripts/jquery.min.js', read: [] },
      ],
      note: 'not read; no application logic',
    },
  ],
};

describe('third-party code on the coverage map (RF-231)', () => {
  it('RF-231 leaves out a listed area the code map marks third-party, from the areas and the counts', () => {
    const state = catalogAndReports();

    const map = coverageOf(state, library, known);

    expect(map.areas.map((each) => each.area)).not.toContain('jQuery');
    expect(map.filesTotal).toBe(12);
  });

  it('RF-231 leaves out a listed area whose note says it has no application logic, whatever the code map says', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Catalog'));

    const map = coverageOf(state, library, []);

    expect(map.areas.map((each) => each.area)).toEqual(['Catalog', 'Models']);
    expect(map.filesTotal).toBe(5);
  });

  it('RF-231 shows no third-party file on the page and counts none as not read', () => {
    const state = catalogAndReports();

    render(<CoverageMap state={state} coverage={library} areas={known} />);

    const region = screen.getByRole('region', { name: 'Coverage map' });
    expect(region.textContent).not.toContain('jquery');
    expect(region.textContent).toContain('1 of 12 files read in 1 area · 2 areas not read');
  });
});

describe('the coverage map on the page', () => {
  it('RF-230 adds no count of areas not read when every area was read', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Catalog'));
    const everyArea: CoverageListing = {
      areas: [{ area: 'Catalog', files: [{ path: 'Catalog/Edit.cs', read }] }],
    };

    render(<CoverageMap state={state} coverage={everyArea} areas={[]} />);

    const region = screen.getByRole('region', { name: 'Coverage map' });
    expect(region.textContent).toContain('1 of 1 file read in 1 area');
    expect(region.textContent).not.toContain('not read');
  });

  it('RF-230 says in words which files were not read and how many files and areas were left', () => {
    const state = catalogAndReports();

    render(<CoverageMap state={state} coverage={listing} areas={known} />);

    const region = screen.getByRole('region', { name: 'Coverage map' });
    expect(region.textContent).toContain('1 of 12 files read in 1 area');
    expect(region.textContent).toContain('2 areas not read');
    const models = within(region).getByRole('region', { name: 'Coverage of Models' });
    expect(models.textContent).toContain('0 of 2 files read');
    expect(within(models).getAllByText('not read')).toHaveLength(2);
    expect(models.textContent).toContain('Note: not read');
    const reports = within(region).getByRole('region', { name: 'Coverage of Reports' });
    expect(reports.textContent).toContain('The code map lists 7 files in this area.');
    const catalog = within(region).getByRole('region', { name: 'Coverage of Catalog' });
    expect(catalog.textContent).not.toContain('Note:');
    expect(within(catalog).getAllByText('not read')).toHaveLength(2);
  });
});
