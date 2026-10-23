import { describe, expect, it } from 'vitest';
import type { Area } from '../../../../src/domain/code-map/area.js';
import {
  groupIntoAreas,
  type GroupingInput,
} from '../../../../src/domain/code-map/area-grouping.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { entry } from '../../../support/code-map-builders.js';

// P3-109, EV-24: the areas of a tree of rendered workbooks.

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

const book = [
  entry('dependencies.md', 5),
  entry('Book.xlsx/workbook.md', 5),
  entry('Book.xlsx/Inventory/values.md', 30),
  entry('Book.xlsx/Inventory/formulas.md', 5),
  entry('Book.xlsx/Report/values.md', 20),
  entry('Book.xlsx/Empty/values.md', 2),
  entry('Book.xlsx/macros/Module1.bas.md', 10),
];

describe('areas of a rendered workbook tree', () => {
  it('P3-109 gives one area per sheet, one for the macros and one for the overview under the budget', () => {
    const areas = group(book, { workbook: { emptyFolders: [] }, areaTokenBudget: 60_000 });

    expect(summary(areas)).toEqual([
      '(root)[folder]=dependencies.md',
      'Book.xlsx[folder]=Book.xlsx/workbook.md',
      'Book.xlsx/Empty[folder]=Book.xlsx/Empty/values.md',
      'Book.xlsx/Inventory[folder]=Book.xlsx/Inventory/formulas.md,Book.xlsx/Inventory/values.md',
      'Book.xlsx/Report[folder]=Book.xlsx/Report/values.md',
      'Book.xlsx/macros[folder]=Book.xlsx/macros/Module1.bas.md',
    ]);
  });

  it('P3-109 mutation: without the workbook rule a workbook under the budget is one area', () => {
    const areas = group(book, { areaTokenBudget: 60_000 });

    expect(areas.map((a) => a.name)).toEqual(['(root)', 'Book.xlsx']);
  });
});

describe('empty and large sheets of a workbook tree', () => {
  it('P3-109 folds a sheet that holds no cell into the overview', () => {
    const areas = group(book, {
      workbook: { emptyFolders: ['Book.xlsx/Empty'] },
      areaTokenBudget: 60_000,
    });

    expect(areas.map((a) => a.name)).toEqual([
      '(root)',
      'Book.xlsx',
      'Book.xlsx/Inventory',
      'Book.xlsx/Report',
      'Book.xlsx/macros',
    ]);
    expect(areas[1]?.files).toEqual(['Book.xlsx/Empty/values.md', 'Book.xlsx/workbook.md']);
  });

  it('P3-109 still splits a sheet larger than the budget into numbered parts', () => {
    const big = [
      entry('Book.xlsx/workbook.md', 5),
      entry('Book.xlsx/Big/a.md', 60),
      entry('Book.xlsx/Big/b.md', 60),
    ];

    const areas = group(big, { workbook: { emptyFolders: [] }, areaTokenBudget: 100 });

    expect(areas.map((a) => a.name)).toEqual(['Book.xlsx', 'Book.xlsx/Big#1', 'Book.xlsx/Big#2']);
  });
});
