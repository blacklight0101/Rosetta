import { describe, expect, it } from 'vitest';
import {
  isRenderedFile,
  isValuesFile,
  renderedFileNamesIn,
} from '../../../../src/domain/sources/rendered-workbook-files.js';

// P3-105, RF-301: which files and words are Rosetta's rendered view of a workbook.

const F = ['Invoice.xlsm'];

describe('the rendered workbook files', () => {
  it('RF-301 knows a rendered file in any folder, and no other file', () => {
    expect(isRenderedFile('Invoice.xlsm/Invoice/formulas.md', F)).toBe(true);
    expect(isRenderedFile('Invoice.xlsm/workbook.md', F)).toBe(true);
    expect(isRenderedFile('Invoice.xlsm/macros/Main.bas', F)).toBe(false);
    expect(isRenderedFile('docs/myworkbook.md', F)).toBe(false);
    expect(isRenderedFile('docs/notes.md', F)).toBe(false);
    expect(isRenderedFile('docs/notes.md')).toBe(false);
  });

  it('RF-301 finds a file name in a text only as a whole name', () => {
    expect(renderedFileNamesIn('See workbook.md and values.md.')).toEqual([
      'workbook.md',
      'values.md',
    ]);
    expect(renderedFileNamesIn('The myvalues.md note and my-workbook.md')).toEqual([]);
    expect(renderedFileNamesIn('WORKBOOK.MD lists sheets')).toEqual(['workbook.md']);
    expect(renderedFileNamesIn('no file here')).toEqual([]);
  });

  it('RF-208 a values file counts only inside a rendered workbook folder', () => {
    expect(isValuesFile('Pricing.xlsx/Quote/values.md', ['Pricing.xlsx'])).toBe(true);
    expect(isValuesFile('docs/values.md', ['Pricing.xlsx'])).toBe(false);
    expect(isValuesFile('Pricing.xlsx/Quote/formulas.md', ['Pricing.xlsx'])).toBe(false);
  });
});
