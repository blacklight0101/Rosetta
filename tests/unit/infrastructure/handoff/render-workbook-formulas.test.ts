import { expect, it } from 'vitest';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import type { ModelTable } from '../../../../src/domain/planning/data-model.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import {
  workbookFormulasOf,
  type FormulaRow,
  type WorkbookFormulas,
} from '../../../../src/domain/planning/workbook-formulas.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { invoiceFormulaFiles } from '../../../support/invoice-formula-files.js';
import { fakeAnthropicKey } from '../../../support/secret-fixture.js';

// RF-623, RF-631, RF-603, ADR-013, P3-94: `workbook-formulas.md` as it is written, the reading-order
// entry in the README, the calculated mark in the data model and the formula links of a task card.
// Written by code from the rendered workbook; cached text is masked, numbers and dates are kept.

const masker = new SecretMasker();
const FILE = 'workbook-formulas.md';
const SHEET = 'Invoice_Sample.xlsm/Invoice';
const invoice = (): WorkbookFormulas => workbookFormulasOf(invoiceFormulaFiles(), { unread: 0 });

function filesOf(extra: Partial<HandoffPackage> = {}): Readonly<Record<string, string>> {
  return renderHandoff(handoffOf('Plain text.', undefined, extra), masker);
}

const formulaFile = (formulas: WorkbookFormulas = invoice()): string =>
  filesOf({ workbookFormulas: formulas })[FILE] ?? '';

const headings = (text: string): string[] => text.split('\n').filter((line) => /^#+ /u.test(line));

it('P3-94 writes workbook-formulas.md per workbook and sheet, one heading for each formula', () => {
  expect(headings(formulaFile())).toEqual([
    '# Workbook formulas',
    '## Invoice\\_Sample.xlsm',
    '### Sheet Calculation',
    '#### F-001',
    '#### F-002',
    '### Sheet Invoice',
    '#### F-003',
    '#### F-004',
    '#### F-005',
    '#### F-006',
    '#### F-007',
    '#### F-008',
    '### Sheet Template',
    '#### F-009',
  ]);
});

it('RF-623 writes a table column formula with its column, its formula once and three cached results', () => {
  const text = formulaFile();
  const section = text.slice(text.indexOf('#### F-003'), text.indexOf('#### F-004'));

  expect(section.trim().split('\n')).toEqual([
    '#### F-003',
    '',
    '- Range: G8:G12 (5 cells)',
    '- Table column: InvoiceTable, "Agreed Amount Total"',
    '- Formula: `[Amount Line 1]+[Amount Line 2]+[Amount Line 3]`',
    '- Cached results: G8 = 175; G9 = 186; G10 = 197',
    `- Lines: ${SHEET.replaceAll('_', '\\_')}/formulas.md:4-9`,
  ]);
});

it('RF-152 writes a shared formula, a SUMIFS and a SUM with their cached results', () => {
  const text = formulaFile();

  expect(text).toContain('- Range: O8:O12 (5 cells, shared formula)');
  expect(text).toContain('- Formula: `G8*0.5`');
  expect(text).toContain('- Cached results: O8 = 87.5');
  expect(text).toContain(
    '- Formula: `SUMIFS(InvoiceTable[Final Invoiced Amount],InvoiceTable[Customer],A2)`',
  );
  expect(text).toContain('- Formula: `SUM(D5:D14)`');
  expect(text).toContain('- Cached results: D15 = 0');
});

it('RF-152 keeps a date as it is written and a number as it is', () => {
  const text = formulaFile();

  expect(text).toContain('- Cached results: N8 = 2026-03-19; N9 = 2026-03-19; N10 = 2026-03-19');
  expect(text).toContain('L8 = 46.25');
});

it('ADR-013 masks a cached text before it is written', () => {
  const text = formulaFile();

  expect(text).toContain('C2 = ');
  expect(text).toContain('Contact key');
  expect(text).not.toContain(fakeAnthropicKey);
  expect(text).not.toContain(fakeAnthropicKey.slice(-30));
});

function hostile(rest: Partial<FormulaRow>): WorkbookFormulas {
  const row: FormulaRow = {
    ...{ id: 'F-001', workbook: 'Book.xlsx', sheet: '<script>alert(1)</script>' },
    ...{ folder: 'Book.xlsx/S', shape: 'single', range: 'A1', cells: 1, formula: '1+1' },
    cached: [],
    source: { path: 'Book.xlsx/S/formulas.md', startLine: 5, endLine: 5 },
    ...rest,
  };
  return { rows: [row], omitted: 0, unread: 0 };
}

it('ADR-013 shows a formula with backticks inside a longer code span and escapes names', () => {
  const text = formulaFile(hostile({ formula: 'A``B|C', table: '<b>T</b>', column: '*c*' }));

  expect(text).toContain('- Formula: ``` A``B|C ```');
  expect(text).toContain('### Sheet &lt;script&gt;alert\\(1\\)&lt;/script&gt;');
  expect(text).toContain('- Table column: &lt;b&gt;T&lt;/b&gt;, "\\*c\\*"');
  expect(text).not.toContain('<script>');
});

it('ADR-013 masks a secret in a formula before it is written', () => {
  const text = formulaFile(hostile({ formula: `"${fakeAnthropicKey}"&A1` }));

  expect(text).not.toContain(fakeAnthropicKey.slice(-30));
});

it('P3-94 says how many formulas were left out and how many files could not be read', () => {
  const formulas = { ...invoice(), omitted: 5, unread: 2 };

  const text = formulaFile(formulas);

  expect(text).toContain('5 formulas were left out because the file reached its limit.');
  expect(text).toContain('2 rendered formulas.md files could not be read.');
});

it('P3-94 says so when the workbooks hold no formula', () => {
  const text = formulaFile({ rows: [], omitted: 0, unread: 0 });

  expect(text).toContain('The rendered workbooks hold no formula.');
  expect(headings(text)).toEqual(['# Workbook formulas']);
});

it('P3-94 writes no workbook-formulas.md for a package without workbook formulas', () => {
  const files = filesOf();

  expect(Object.keys(files)).not.toContain(FILE);
  expect(files['README.md']).not.toContain(FILE);
});

it('P3-94 leaves every other file of the package as it was', () => {
  const others = (files: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(files).filter(([path]) => path !== 'README.md' && path !== FILE),
    );

  expect(others(filesOf({ workbookFormulas: invoice() }))).toEqual(others(filesOf()));
});

it('RF-601 lists the file in the reading order after the entity mapping', () => {
  const readme = filesOf({ workbookFormulas: invoice() })['README.md'] ?? '';
  const order = readme.split('\n').filter((line) => /^\d+\. /u.test(line));
  const at = order.findIndex((line) => line.includes('entity-mapping.md'));

  expect(order[at + 1]).toMatch(/^\d+\. \[Workbook formulas\]\(workbook-formulas\.md\)$/u);
});

const entity: SourceCard = {
  ...{ id: 'ENT-001', type: 'ENT', title: 'Invoice', summary: 'An invoice.', area: 'Invoice' },
  claims: [
    {
      claimId: 'ENT-001.c1',
      text: 'An invoice has an agreed amount total and a customer.',
      citations: [{ path: `${SHEET}/values.md`, startLine: 7, endLine: 8 }],
      status: 'Supported',
    },
  ],
};

const rule: SourceCard = {
  ...{ id: 'BR-001', type: 'BR', title: 'VAT', summary: 'VAT.', area: 'Invoice' },
  claims: [
    {
      claimId: 'BR-001.c1',
      text: 'VAT to pay is the net amount times the VAT rate.',
      citations: [{ path: `${SHEET}/formulas.md`, startLine: 19, endLine: 19 }],
      status: 'Supported',
    },
  ],
};

const table: ModelTable = {
  ...{ name: 'invoice', purpose: 'Keeps invoices.', sources: ['ENT-001'] },
  columns: [
    {
      ...{ name: 'agreed_total', type: 'numeric(12,2)', nullable: false, migrationRisk: '' },
      legacy: { cardId: 'ENT-001', claimId: 'ENT-001.c1', field: 'Agreed Amount Total' },
    },
    {
      ...{ name: 'customer', type: 'text', nullable: false, migrationRisk: '' },
      legacy: { cardId: 'ENT-001', claimId: 'ENT-001.c1', field: 'Customer' },
    },
  ],
  ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
};

function packageWith(builds: string[], requirements: string[]): Partial<HandoffPackage> {
  const base = handoffOf('Plain text.');
  const [task] = base.content.tasks;
  if (task === undefined) throw new Error('The fixture has a task');
  return {
    workbookFormulas: invoice(),
    sources: [...base.sources, entity, rule],
    dataModel: { database: null, tables: [table], dropped: [] },
    content: {
      ...base.content,
      requirements: [
        { id: 'REQ-001', title: 'VAT', statement: 'VAT is charged.', sources: ['BR-001'] },
      ],
      tasks: [{ ...task, builds, requirements }],
    },
  };
}

it('RF-623 marks a column whose legacy source is a calculated table column and links its formula', () => {
  const text = filesOf(packageWith([], []))['data-model.md'] ?? '';
  const rows = text
    .split('\n')
    .filter((line) => line.startsWith('| agreed') || line.startsWith('| customer'));

  expect(rows[0]).toContain('calculated: [F-003](workbook-formulas.md#f-003)');
  expect(rows[1]).not.toContain('calculated');
});

it('RF-623 marks nothing in a package without workbook formulas', () => {
  const text = filesOf({ ...packageWith([], []), workbookFormulas: undefined })['data-model.md'];

  expect(text).not.toContain('calculated');
});

it('RF-631 links the formulas of the calculated columns of a table the card builds', () => {
  const text = filesOf(packageWith(['table:invoice'], []))['tasks.md'] ?? '';

  expect(text).toContain('Formulas: [F-003](workbook-formulas.md#f-003)');
});

it('RF-631 links the formula a rule requirement of the card cites', () => {
  const text = filesOf(packageWith([], ['REQ-001']))['tasks.md'] ?? '';

  expect(text).toContain('Formulas: [F-005](workbook-formulas.md#f-005)');
});

it('RF-631 links both, once each, and no line for a card with no formula', () => {
  const both = filesOf(packageWith(['table:invoice'], ['REQ-001']))['tasks.md'] ?? '';
  const none = filesOf(packageWith([], []))['tasks.md'] ?? '';

  expect(both).toContain(
    'Formulas: [F-003](workbook-formulas.md#f-003), [F-005](workbook-formulas.md#f-005)',
  );
  expect(none).not.toContain('Formulas:');
});
