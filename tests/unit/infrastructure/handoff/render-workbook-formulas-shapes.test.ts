import { expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import {
  workbookFormulasOf,
  type FormulaRow,
} from '../../../../src/domain/planning/workbook-formulas.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { invoiceFormulaFiles } from '../../../support/invoice-formula-files.js';

// RF-623, P3-94: how the range of a row reads for each shape, and that a file with nothing left out
// and nothing unread says nothing of either.

const masker = new SecretMasker();

function fileOf(rows: readonly FormulaRow[]): string {
  const extra: Partial<HandoffPackage> = { workbookFormulas: { rows, omitted: 0, unread: 0 } };
  return (
    renderHandoff(handoffOf('Plain text.', undefined, extra), masker)['workbook-formulas.md'] ?? ''
  );
}

const invoiceRows = (): readonly FormulaRow[] =>
  workbookFormulasOf(invoiceFormulaFiles(), { unread: 0 }).rows;

it('P3-94 writes a single cell as its address, a region with its cell count, a shared and an array formula by shape', () => {
  const rows = invoiceRows();
  const [first] = rows;
  if (first === undefined) throw new Error('The invoice workbook has formulas');
  const array: FormulaRow = { ...first, id: 'F-010', shape: 'array', range: 'F2:F9', cells: 8 };

  const text = fileOf([...rows, array]);

  expect(text).toContain('- Range: D15\n');
  expect(text).toContain('- Range: G8:G12 (5 cells)\n');
  expect(text).toContain('- Range: O8:O12 (5 cells, shared formula)\n');
  expect(text).toContain('- Range: F2:F9 (8 cells, array formula)\n');
});

it('P3-94 says nothing about formulas left out or files unread when there are none', () => {
  const text = fileOf(invoiceRows());

  expect(text).not.toContain('left out');
  expect(text).not.toContain('could not be read');
});
