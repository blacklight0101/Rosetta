import { describe, expect, it } from 'vitest';
import type { Area } from '../../../../src/domain/code-map/area.js';
import {
  groupIntoAreas,
  type GroupingInput,
} from '../../../../src/domain/code-map/area-grouping.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { entry, underFolder } from '../../../support/code-map-builders.js';

function group(files: readonly FileEntry[], rest: Partial<GroupingInput> = {}): readonly Area[] {
  const result = groupIntoAreas({
    files,
    links: [],
    areaTokenBudget: 100,
    configured: [],
    ...rest,
  });
  if (!result.ok) throw new Error(`grouping failed: ${result.error}`);
  return result.value;
}

const summary = (areas: readonly Area[]): string[] =>
  areas.map((a) => `${a.name}[${a.origin}]=${a.files.join(',')}`);

describe('grouping files into areas', () => {
  it('RF-104 gives each top-level folder its own area and keeps root files together', () => {
    const areas = group([
      entry('a.cs'),
      entry('Data/x.cs'),
      entry('Web/Pages/p.cs'),
      entry('Web/q.cs'),
    ]);

    expect(summary(areas)).toEqual([
      '(root)[folder]=a.cs',
      'Data[folder]=Data/x.cs',
      'Web[folder]=Web/Pages/p.cs,Web/q.cs',
    ]);
  });

  it('RF-104 splits a folder over the budget by sub-folder, its own files staying in the folder area', () => {
    const areas = group([
      entry('Web/own.cs', 30),
      entry('Web/Pages/a.cs', 40),
      entry('Web/Admin/b.cs', 40),
    ]);

    expect(summary(areas)).toEqual([
      'Web[folder]=Web/own.cs',
      'Web/Admin[folder]=Web/Admin/b.cs',
      'Web/Pages[folder]=Web/Pages/a.cs',
    ]);
  });

  it('RF-104 splits a group that is still over the budget into numbered parts in path order', () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((n) => entry(`Big/${n}.cs`, 40));
    const areas = group(files);

    expect(summary(areas)).toEqual([
      'Big#1[folder]=Big/a.cs,Big/b.cs',
      'Big#2[folder]=Big/c.cs,Big/d.cs',
      'Big#3[folder]=Big/e.cs',
    ]);
    expect(areas.every((a) => a.estimatedTokens <= 100)).toBe(true);
  });

  it('RF-104 a single file larger than the budget gets an area of its own', () => {
    const areas = group([entry('Big/a.cs', 30), entry('Big/huge.sql', 900), entry('Big/z.cs', 30)]);

    expect(summary(areas)).toEqual([
      'Big#1[folder]=Big/a.cs',
      'Big#2[folder]=Big/huge.sql',
      'Big#3[folder]=Big/z.cs',
    ]);
  });

  it('RF-104 puts files that a language pack links together into one area, whatever their folder', () => {
    const files = [
      entry('Pages/Home.aspx', 10),
      entry('Code/Home.aspx.cs', 10),
      entry('Code/Other.cs', 10),
    ];
    const areas = group(files, {
      links: [{ from: 'Pages/Home.aspx', to: 'Code/Home.aspx.cs' }],
    });

    expect(summary(areas)).toEqual([
      'Code[folder]=Code/Other.cs',
      'Pages[references]=Code/Home.aspx.cs,Pages/Home.aspx',
    ]);
  });

  it('RF-104 leaves a linked group apart when together they would pass the budget', () => {
    const files = [entry('A/x.cs', 70), entry('B/y.cs', 70)];
    const areas = group(files, { links: [{ from: 'A/x.cs', to: 'B/y.cs' }] });

    expect(summary(areas)).toEqual(['A[folder]=A/x.cs', 'B[folder]=B/y.cs']);
  });

  it('RF-104 keeps linked files together when a big group is split', () => {
    const files = [
      entry('G/a.cs', 40),
      entry('G/b.cs', 40),
      entry('G/c.cs', 40),
      entry('G/d.cs', 40),
    ];
    const areas = group(files, { links: [{ from: 'G/b.cs', to: 'G/c.cs' }] });

    expect(summary(areas)).toEqual([
      'G#1[folder]=G/a.cs',
      'G#2[folder]=G/b.cs,G/c.cs',
      'G#3[folder]=G/d.cs',
    ]);
  });

  it('RF-104 configured areas replace the automatic grouping for the files they match', () => {
    const files = [entry('Web/a.cs'), entry('Web/b.cs'), entry('Data/x.cs'), entry('Data/y.cs')];
    const areas = group(files, {
      configured: [
        { name: 'Checkout', matches: (path) => path === 'Web/a.cs' || path === 'Data/x.cs' },
      ],
    });

    expect(summary(areas)).toEqual([
      'Checkout[config]=Data/x.cs,Web/a.cs',
      'Data[folder]=Data/y.cs',
      'Web[folder]=Web/b.cs',
    ]);
  });

  it('RF-104 a file goes to the first configured area that matches it', () => {
    const areas = group([entry('Web/a.cs')], {
      configured: [
        { name: 'One', matches: underFolder('Web') },
        { name: 'Two', matches: underFolder('Web') },
      ],
    });

    expect(summary(areas)).toEqual(['One[config]=Web/a.cs']);
  });

  it('RF-104 a configured area over the budget is split like any other', () => {
    const files = [entry('W/a.cs', 60), entry('W/b.cs', 60)];
    const areas = group(files, { configured: [{ name: 'All', matches: underFolder('W') }] });

    expect(summary(areas)).toEqual(['All#1[config]=W/a.cs', 'All#2[config]=W/b.cs']);
  });

  it('RF-104 a configured area that matches nothing makes no area', () => {
    const areas = group([entry('a.cs')], { configured: [{ name: 'None', matches: () => false }] });

    expect(summary(areas)).toEqual(['(root)[folder]=a.cs']);
  });

  it('RF-104 links are not followed into or out of a configured area', () => {
    const files = [entry('A/x.cs'), entry('B/y.cs')];
    const areas = group(files, {
      links: [{ from: 'A/x.cs', to: 'B/y.cs' }],
      configured: [{ name: 'Mine', matches: (path) => path === 'A/x.cs' }],
    });

    expect(summary(areas)).toEqual(['B[folder]=B/y.cs', 'Mine[config]=A/x.cs']);
  });

  it('RF-104 an automatic area that would take a configured name is renamed', () => {
    const areas = group([entry('Web/a.cs'), entry('Data/b.cs')], {
      configured: [{ name: 'Web', matches: underFolder('Data') }],
    });

    expect(summary(areas)).toEqual(['Web (auto)[folder]=Web/a.cs', 'Web[config]=Data/b.cs']);
  });

  it('RF-104 refuses two configured areas with one name and a budget that is not positive', () => {
    const two = { name: 'Same', matches: () => false };

    expect(
      groupIntoAreas({ files: [], links: [], areaTokenBudget: 10, configured: [two, two] }),
    ).toEqual({ ok: false, error: 'duplicate-configured-area' });
    expect(groupIntoAreas({ files: [], links: [], areaTokenBudget: 0, configured: [] })).toEqual({
      ok: false,
      error: 'invalid-budget',
    });
  });

  it('RF-106 gives the same areas whatever the order of the input', () => {
    const files = [
      entry('Pages/Home.aspx', 10),
      entry('Code/Home.aspx.cs', 10),
      entry('Code/Other.cs', 10),
      entry('a.cs', 10),
    ];
    const links = [{ from: 'Pages/Home.aspx', to: 'Code/Home.aspx.cs' }];

    expect(group([...files].reverse(), { links })).toEqual(group(files, { links }));
  });

  it('RF-104 every file lands in exactly one area and none is invented', () => {
    const files = Array.from({ length: 40 }, (_, i) =>
      entry(`F${String(i % 5)}/s${String(i % 3)}/f${String(i)}.cs`, 7 + i),
    );
    const placed = group(files).flatMap((area) => area.files);

    expect([...placed].sort()).toEqual(files.map((f) => f.path).sort());
  });
});
