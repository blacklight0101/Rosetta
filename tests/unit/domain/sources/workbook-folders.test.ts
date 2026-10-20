import { describe, expect, it } from 'vitest';
import {
  areaHoldsWorkbook,
  workbookFoldersOf,
} from '../../../../src/domain/sources/workbook-folders.js';

// RF-155, RFC-005 section 4.7: the guidance for a workbook is chosen from the folders of the
// rendered workbooks the snapshot lists, never from the files' names or content (ADR-004).

const entry = (folder: string) => ({ folder });

describe('the folders of the rendered workbooks of a snapshot', () => {
  it('RF-155 a record that lists workbooks gives their folders, in order', () => {
    expect(workbookFoldersOf({ workbooks: [entry('Pricing'), entry('models/Costs')] })).toEqual([
      'Pricing',
      'models/Costs',
    ]);
  });

  it('RF-155 a record that lists none (a GitHub record, a zip without workbooks) gives none', () => {
    expect(workbookFoldersOf({})).toEqual([]);
    expect(workbookFoldersOf({ workbooks: [] })).toEqual([]);
  });
});

describe('an area that holds a rendered workbook', () => {
  const folders = ['Pricing', 'models/Costs'];

  it('RF-155 an area with a file inside a workbook folder holds a workbook', () => {
    expect(
      areaHoldsWorkbook({ files: ['Pricing/workbook.md', 'Pricing/Quote/values.md'] }, folders),
    ).toBe(true);
    expect(
      areaHoldsWorkbook({ files: ['readme.md', 'models/Costs/Plan/formulas.md'] }, folders),
    ).toBe(true);
  });

  it('RF-155 an area of other files in the same zip holds none', () => {
    expect(areaHoldsWorkbook({ files: ['src/App.cs', 'docs/readme.md'] }, folders)).toBe(false);
  });

  it('RF-155 a folder name is a whole path segment: PricingTool/ is not inside Pricing/', () => {
    expect(areaHoldsWorkbook({ files: ['PricingTool/App.cs', 'Pricing.md'] }, folders)).toBe(false);
  });

  it('RF-155 a run with no listed workbooks holds none in any area', () => {
    expect(areaHoldsWorkbook({ files: ['Pricing/workbook.md'] }, [])).toBe(false);
    expect(areaHoldsWorkbook({ files: ['Pricing/workbook.md'] }, undefined)).toBe(false);
  });
});
