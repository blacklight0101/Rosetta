import { expect, it } from 'vitest';
import type { LegacySource, ModelTable } from '../../../../src/domain/planning/data-model.js';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import {
  formulasCitedBy,
  formulasOfColumn,
  formulasOfTask,
} from '../../../../src/domain/planning/workbook-formula-links.js';
import {
  workbookFormulasOf,
  type FormulaRow,
  type WorkbookFormulas,
} from '../../../../src/domain/planning/workbook-formulas.js';
import { invoiceFormulaFiles } from '../../../support/invoice-formula-files.js';

// RF-623, RF-631, P3-94: which formula rows a target column, a citation and a task card link. A
// column links the rows of the calculated table column its legacy field names; a rule card that
// cites a formula line links the formula; a task card links both for what it builds.

const SHEET = 'Invoice_Sample.xlsm/Invoice';
const invoice = (): WorkbookFormulas => workbookFormulasOf(invoiceFormulaFiles(), { unread: 0 });
const ids = (rows: readonly FormulaRow[]): string[] => rows.map((row) => row.id);

function legacy(field: string, claimId = 'ENT-001.c1'): LegacySource {
  return { cardId: claimId.split('.')[0] ?? '', claimId, field };
}

function card(id: string, type: SourceCard['type'], paths: readonly string[]): SourceCard {
  return {
    ...{ id, type, title: id, summary: id, area: 'Invoice_Sample.xlsm' },
    claims: paths.map((path, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text: 'A claim.',
      citations: [{ path, startLine: 5, endLine: 5 }],
      status: 'Supported' as const,
    })),
  };
}

function row(id: string, folder: string, column: string, table = 'Lines'): FormulaRow {
  return {
    ...{ id, workbook: 'Book.xlsx', sheet: folder.split('/')[1] ?? '', folder },
    ...{ shape: 'region', range: 'A2:A9', cells: 8, table, column, formula: '[A]*2' },
    cached: [],
    source: { path: `${folder}/formulas.md`, startLine: 4, endLine: 12 },
  };
}

const entity = card('ENT-001', 'ENT', [`${SHEET}/values.md`]);

it('RF-623 links the rows of the calculated column the legacy field names', () => {
  const field = legacy('Agreed Amount Total');

  expect(ids(formulasOfColumn(invoice(), [entity], field))).toEqual(['F-003']);
});

it('RF-623 matches the name without regard to case or spaces at its ends', () => {
  expect(ids(formulasOfColumn(invoice(), [entity], legacy('  agreed AMOUNT total ')))).toEqual([
    'F-003',
  ]);
});

it('RF-623 links nothing for a column that holds no formula, or a column of no table', () => {
  for (const name of ['Customer', 'Invoiced', 'Contact key', '']) {
    expect(formulasOfColumn(invoice(), [entity], legacy(name))).toEqual([]);
  }
});

it('RF-623 links nothing without a legacy source or without formulas', () => {
  expect(formulasOfColumn(invoice(), [entity], null)).toEqual([]);
  expect(formulasOfColumn(undefined, [entity], legacy('Agreed Amount Total'))).toEqual([]);
});

it('RF-623 links every row of a column with mixed formulas', () => {
  const rows = [row('F-001', 'B.xlsx/S', 'Total'), row('F-002', 'B.xlsx/S', 'Total')];
  const formulas = { rows, omitted: 0, unread: 0 };

  expect(ids(formulasOfColumn(formulas, [], legacy('Total')))).toEqual(['F-001', 'F-002']);
});

it('RF-623 takes the table the claim cites when two tables have a column of that name', () => {
  const rows = [
    row('F-001', 'B.xlsx/Sales', 'Total', 'A'),
    row('F-002', 'B.xlsx/Costs', 'Total', 'B'),
  ];
  const formulas = { rows, omitted: 0, unread: 0 };
  const cited = card('ENT-001', 'ENT', ['B.xlsx/Costs/values.md']);

  expect(ids(formulasOfColumn(formulas, [cited], legacy('Total')))).toEqual(['F-002']);
});

it('RF-623 links neither table when the claim does not tell them apart', () => {
  const rows = [
    row('F-001', 'B.xlsx/Sales', 'Total', 'A'),
    row('F-002', 'B.xlsx/Costs', 'Total', 'B'),
  ];
  const formulas = { rows, omitted: 0, unread: 0 };
  const elsewhere = card('ENT-001', 'ENT', ['B.xlsx/Other/values.md']);

  expect(formulasOfColumn(formulas, [elsewhere], legacy('Total'))).toEqual([]);
  expect(formulasOfColumn(formulas, [], legacy('Total'))).toEqual([]);
});

it('RF-623 reads a folder name as a whole folder, not as the start of another name', () => {
  const rows = [
    row('F-001', 'B.xlsx/Sales', 'Total', 'A'),
    row('F-002', 'B.xlsx/Sales2', 'Total', 'B'),
  ];
  const formulas = { rows, omitted: 0, unread: 0 };
  const cited = card('ENT-001', 'ENT', ['B.xlsx/Sales2/values.md']);

  expect(ids(formulasOfColumn(formulas, [cited], legacy('Total')))).toEqual(['F-002']);
});

const cite = (path: string, startLine: number, endLine = startLine) => ({
  path,
  startLine,
  endLine,
});

it('RF-631 links the rows whose lines the citation touches, each once, in order', () => {
  const citations = [cite(`${SHEET}/formulas.md`, 9, 12), cite(`${SHEET}/formulas.md`, 10)];

  expect(ids(formulasCitedBy(invoice(), citations))).toEqual(['F-003', 'F-004']);
});

it('RF-631 links a row when the citation holds the heading line of its region', () => {
  expect(ids(formulasCitedBy(invoice(), [cite(`${SHEET}/formulas.md`, 4)]))).toEqual(['F-003']);
});

it('RF-631 links nothing for another file, lines between regions or no formulas', () => {
  const other = cite('Invoice_Sample.xlsm/Template/values.md', 5);

  expect(formulasCitedBy(invoice(), [other, cite(`${SHEET}/formulas.md`, 10)])).toEqual([]);
  expect(formulasCitedBy(invoice(), [cite(`${SHEET}/formulas.md`, 1, 3)])).toEqual([]);
  expect(formulasCitedBy(undefined, [other])).toEqual([]);
});

const table: ModelTable = {
  ...{ name: 'invoice', purpose: 'Keeps invoices.', sources: ['ENT-001'] },
  columns: [
    {
      name: 'agreed_total',
      type: 'numeric',
      nullable: false,
      legacy: legacy('Agreed Amount Total'),
      migrationRisk: '',
    },
    {
      name: 'customer',
      type: 'text',
      nullable: false,
      legacy: legacy('Customer'),
      migrationRisk: '',
    },
    { name: 'note', type: 'text', nullable: true, legacy: null, migrationRisk: '' },
  ],
  ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
};
const dataModel = { database: null, tables: [table], dropped: [] };
const sources = [
  card('ENT-001', 'ENT', [`${SHEET}/values.md`]),
  { ...card('BR-001', 'BR', [`${SHEET}/formulas.md`]), claims: ruleClaims(12) },
  { ...card('FEAT-001', 'FEAT', [`${SHEET}/formulas.md`]), claims: ruleClaims(19) },
];
const requirements = [
  { id: 'REQ-001', title: 'Due date', statement: 'Rule.', sources: ['BR-001'] },
  { id: 'REQ-002', title: 'Feature', statement: 'Feature.', sources: ['FEAT-001'] },
];

function ruleClaims(line: number): SourceCard['claims'] {
  const citations = [{ path: `${SHEET}/formulas.md`, startLine: line, endLine: line }];
  return [{ claimId: 'X.c1', text: 'A claim.', citations, status: 'Supported' }];
}

function task(rest: Partial<PlanTask>): PlanTask {
  return {
    ...{ id: 'T-001', title: 'Task', phase: 1, requirements: [], acceptanceCriteria: [] },
    ...{ invariant: '', riskClass: 'none', adds: [], probes: [], files: [] },
    ...{ identifiers: [], dependsOn: [], builds: [] },
    ...rest,
  };
}

const parts = { requirements, sources, dataModel };

it('RF-623 links the calculated columns of a table the card builds', () => {
  const built = task({ builds: ['table:invoice'] });

  expect(ids(formulasOfTask(invoice(), built, parts))).toEqual(['F-003']);
});

it('RF-631 links the formulas a rule requirement of the card cites, and not a feature', () => {
  const rule = task({ requirements: ['REQ-001', 'REQ-002'] });

  expect(ids(formulasOfTask(invoice(), rule, parts))).toEqual(['F-004']);
});

it('RF-631 links both kinds once each, in the order of the rows', () => {
  const both = task({ builds: ['table:invoice'], requirements: ['REQ-001'] });

  expect(ids(formulasOfTask(invoice(), both, parts))).toEqual(['F-003', 'F-004']);
});

it('RF-631 links nothing for a card that builds another item and cites no rule', () => {
  const plain = task({ builds: ['feature:F-001', 'table:other'], requirements: ['REQ-002'] });

  expect(formulasOfTask(invoice(), plain, parts)).toEqual([]);
  expect(formulasOfTask(undefined, task({ builds: ['table:invoice'] }), parts)).toEqual([]);
});
