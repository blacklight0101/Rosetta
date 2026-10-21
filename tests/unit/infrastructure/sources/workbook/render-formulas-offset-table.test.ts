import { expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../../src/application/plan/handoff-package.js';
import { workbookFormulasOf } from '../../../../../src/domain/planning/workbook-formulas.js';
import { SecretMasker } from '../../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { handoffOf } from '../../../../support/handoff-package-fixture.js';
import {
  book,
  cell,
  fileOf,
  linesOf,
  num,
  sheet,
} from '../../../../support/rendered-workbook-fixtures.js';

// RF-152, P3-94: a table that does not start at column A and runs past Z. The column of a cell is
// found from the table's first column, not from the sheet's.

const LETTERS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'] as const;
const MORE = ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB'] as const;
const NAMED: Record<string, string> = {
  R: 'Agreed Amount Total',
  T: 'Net Amount',
  U: 'Final Invoiced Amount',
  AA: 'VAT to Pay',
  AB: 'Transfer Savings',
};
const FORMULAS: Record<string, (row: string) => string> = {
  R: (row) => `P${row}*Q${row}`,
  T: (row) => `R${row}+S${row}`,
  U: (row) => `T${row}+AA${row}`,
  AA: (row) => `T${row}*0.25`,
  AB: (row) => `U${row}-R${row}`,
};

function offsetBook() {
  const columns = [...LETTERS, ...MORE].map((letter) => NAMED[letter] ?? `Column ${letter}`);
  const rows = ['7', '8', '9', '10', '11'];
  const cells = Object.entries(FORMULAS).flatMap(([letter, write]) =>
    rows.map((row) =>
      cell(`${letter}${row}`, num(Number(row)), { formula: { kind: 'normal', text: write(row) } }),
    ),
  );
  const tables = [{ name: 'OffsetTable', range: 'B7:AB10', columns }];
  return book([sheet('Offset', { tables, cells })]);
}

const headings = (content: string): string[] =>
  linesOf(content).filter((line) => line.startsWith('## '));

it('RF-152 names the columns of a table that starts at B and runs past Z, not the header or the rows below', () => {
  const content = fileOf(renderWorkbook(offsetBook()), 'Offset/formulas.md');

  expect(headings(content)).toEqual([
    '## Region R8:R10 (3 formulas), OffsetTable column "Agreed Amount Total"',
    '## Region T8:T10 (3 formulas), OffsetTable column "Net Amount"',
    '## Region U8:U10 (3 formulas), OffsetTable column "Final Invoiced Amount"',
    '## Region AA8:AA10 (3 formulas), OffsetTable column "VAT to Pay"',
    '## Region AB8:AB10 (3 formulas), OffsetTable column "Transfer Savings"',
    '## Single cells (10 formulas)',
  ]);
  expect(content.split('## Single cells')[1]).not.toContain(' column "');
});

it('RF-152 P3-94 writes the package file with Net Amount for column T of an offset table', () => {
  const rendered = renderWorkbook(offsetBook());
  const files = rendered.files
    .filter((file) => file.path.endsWith('/formulas.md'))
    .map((file) => ({ path: file.path, text: file.content }));
  const formulas = workbookFormulasOf(files, { unread: 0 });
  const extra: Partial<HandoffPackage> = { workbookFormulas: formulas };

  const text =
    renderHandoff(handoffOf('Plain text.', undefined, extra), new SecretMasker())[
      'workbook-formulas.md'
    ] ?? '';

  const net = formulas.rows.find((row) => row.range.startsWith('T8'));
  expect(net?.column).toBe('Net Amount');
  expect(formulas.rows.find((row) => row.range === 'T7')?.column).toBeUndefined();
  expect(formulas.rows.find((row) => row.range === 'T11')?.column).toBeUndefined();
  expect(text).toContain('- Table column: OffsetTable, "Net Amount"');
  expect(text).toContain('- Table column: OffsetTable, "Transfer Savings"');
});
