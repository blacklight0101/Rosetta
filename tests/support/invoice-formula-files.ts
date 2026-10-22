import type { FormulaFile } from '../../src/domain/planning/workbook-formulas.js';
import { renderWorkbook } from '../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { invoiceWorkbook } from './invoice-workbook-fixture.js';

// P3-94: the rendered `formulas.md` files of the invoicing workbook, as a plan run reads them from
// a snapshot: path and text, in path order.

/** Every rendered file of the invoicing workbook by path. */
export function invoiceRendered(): Record<string, string> {
  const rendered = renderWorkbook(invoiceWorkbook());
  return Object.fromEntries(rendered.files.map((file) => [file.path, file.content]));
}

/** The `formulas.md` files, sorted by path. */
export function invoiceFormulaFiles(): FormulaFile[] {
  return Object.entries(invoiceRendered())
    .filter(([path]) => path.endsWith('/formulas.md'))
    .map(([path, text]) => ({ path, text }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}
