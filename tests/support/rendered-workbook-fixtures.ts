import type {
  CellValue,
  WorkbookCell,
  WorkbookModel,
  WorkbookSheet,
} from '../../src/infrastructure/sources/workbook/workbook-model.js';
import type { RenderedWorkbook } from '../../src/infrastructure/sources/workbook/workbook-renderer.js';

// P3-46: typed workbook models built by hand for the renderer tests. Generated test data only.

export const text = (value: string): CellValue => ({ type: 'text', value });
export const num = (value: number): CellValue => ({ type: 'number', value });

export function cell(
  address: string,
  value?: CellValue,
  rest: Partial<WorkbookCell> = {},
): WorkbookCell {
  return { address, ...(value === undefined ? {} : { value }), ...rest };
}

export function sheet(name: string, rest: Partial<WorkbookSheet> = {}): WorkbookSheet {
  return {
    name,
    state: 'visible',
    part: 'xl/worksheets/sheet1.xml',
    cells: [],
    mergedRanges: [],
    hiddenRows: { ranges: [], omitted: 0 },
    hiddenColumns: { ranges: [], omitted: 0 },
    validations: [],
    conditionalRules: [],
    comments: [],
    tables: [],
    pivots: [],
    charts: [],
    ...rest,
  };
}

export function book(
  sheets: readonly WorkbookSheet[],
  rest: Partial<WorkbookModel> = {},
): WorkbookModel {
  return {
    fileName: 'Book.xlsx',
    date1904: false,
    sheets,
    definedNames: [],
    externalLinks: [],
    connections: [],
    hasMacros: false,
    sharedStringCount: 0,
    ...rest,
  };
}

/** The text of one rendered file, by its path below the workbook folder. */
export function fileOf(rendered: RenderedWorkbook, relative: string): string {
  const found = rendered.files.find((file) => file.path === `${rendered.folder}/${relative}`);
  if (found === undefined) throw new Error(`No rendered file ${relative}`);
  return found.content;
}

export function linesOf(content: string): string[] {
  return content.split('\n');
}
