import { expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { FormulaRow } from '../../../../src/domain/planning/workbook-formulas.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-623, ADR-013, P3-94: the forms of `workbook-formulas.md` the invoice workbook does not reach:
// the count notes in the singular, a second workbook, a formula with no stored result, white space
// in a formula, and the order of the rows.

const masker = new SecretMasker();

function row(id: string, rest: Partial<FormulaRow> = {}): FormulaRow {
  return {
    ...{ id, workbook: 'One.xlsx', sheet: 'First', folder: 'One.xlsx/First' },
    ...{ shape: 'single', range: 'A1', cells: 1, formula: '1+1', cached: [] },
    source: { path: 'One.xlsx/First/formulas.md', startLine: 5, endLine: 5 },
    ...rest,
  };
}

function fileOf(rows: readonly FormulaRow[], notes = { omitted: 0, unread: 0 }): string {
  const extra: Partial<HandoffPackage> = { workbookFormulas: { rows, ...notes } };
  return (
    renderHandoff(handoffOf('Plain text.', undefined, extra), masker)['workbook-formulas.md'] ?? ''
  );
}

const headings = (text: string): string[] => text.split('\n').filter((line) => /^#+ /u.test(line));

it('P3-94 says one formula was left out and one file could not be read, in the singular', () => {
  const text = fileOf([row('F-001')], { omitted: 1, unread: 1 });

  expect(text).toContain('1 formula was left out because the file reached its limit.');
  expect(text).toContain('1 rendered formulas.md file could not be read.');
});

it('P3-94 opens a heading for each workbook and each sheet when either changes', () => {
  const text = fileOf([
    row('F-001'),
    row('F-002', { sheet: 'Second', folder: 'One.xlsx/Second' }),
    row('F-003', { workbook: 'Two.xlsx', folder: 'Two.xlsx/First' }),
    row('F-004', { workbook: 'Two.xlsx', folder: 'Two.xlsx/First' }),
  ]);

  expect(headings(text)).toEqual([
    '# Workbook formulas',
    '## One.xlsx',
    '### Sheet First',
    '#### F-001',
    '### Sheet Second',
    '#### F-002',
    '## Two.xlsx',
    '### Sheet First',
    '#### F-003',
    '#### F-004',
  ]);
});

it('P3-94 says so for a formula stored without a result, and collapses white space in a formula', () => {
  const text = fileOf([row('F-001', { formula: 'A1 +\n   B1' })]);

  expect(text).toContain('- Cached results: none stored');
  expect(text).toContain('- Formula: `A1 + B1`');
});
