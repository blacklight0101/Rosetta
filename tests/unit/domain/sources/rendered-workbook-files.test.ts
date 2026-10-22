import { describe, expect, it } from 'vitest';
import {
  isRenderedFile,
  isValuesFile,
  renderedFileNamesIn,
} from '../../../../src/domain/sources/rendered-workbook-files.js';

// P3-105, RF-301: which files and words are Rosetta's rendered view of a workbook.

describe('the rendered workbook files', () => {
  it('RF-301 knows a rendered file in any folder, and no other file', () => {
    expect(isRenderedFile('Invoice.xlsm/Invoice/formulas.md')).toBe(true);
    expect(isRenderedFile('Invoice.xlsm/workbook.md')).toBe(true);
    expect(isRenderedFile('Invoice.xlsm/macros/Main.bas')).toBe(false);
    expect(isRenderedFile('docs/myworkbook.md')).toBe(false);
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

  it('RF-208 a values file has a folder above it', () => {
    expect(isValuesFile('Pricing.xlsx/Quote/values.md')).toBe(true);
    expect(isValuesFile('values.md')).toBe(false);
    expect(isValuesFile('Pricing.xlsx/Quote/formulas.md')).toBe(false);
  });
});
