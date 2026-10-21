import { expect, it } from 'vitest';
import type { PlanTask } from '../../../../src/domain/planning/plan-content.js';
import type { SourceCard } from '../../../../src/domain/planning/plan-sources.js';
import {
  formulasOfColumn,
  formulasOfTask,
} from '../../../../src/domain/planning/workbook-formula-links.js';
import type { FormulaRow } from '../../../../src/domain/planning/workbook-formulas.js';

// RF-623, RF-631, P3-94: the edges of tying formula rows to columns and task cards: a column with
// no name, a name two cited tables share, a claim the verifier did not support, an item that is
// not a table.

function row(id: string, folder: string, column: string, table: string): FormulaRow {
  return {
    ...{ id, workbook: 'B.xlsx', sheet: folder.replace(/^.*\//u, ''), folder, shape: 'region' },
    ...{ range: 'A2:A9', cells: 8, table, column, formula: '[A]*2', cached: [] },
    source: { path: `${folder}/formulas.md`, startLine: 4, endLine: 12 },
  };
}

/** A card with one claim that cites these files, line 5 of each. */
function card(
  id: string,
  type: SourceCard['type'],
  status: 'Supported' | 'Rejected',
  paths: readonly string[],
): SourceCard {
  const citations = paths.map((path) => ({ path, startLine: 5, endLine: 5 }));
  const claims = [{ claimId: `${id}.c1`, text: 'A claim.', citations, status }];
  return { ...{ id, type, title: id, summary: id, area: 'B.xlsx' }, claims };
}

const legacy = (field: string) => ({ cardId: 'ENT-001', claimId: 'ENT-001.c1', field });

it('RF-623 links nothing for a legacy field with no name, even when a column has none', () => {
  const formulas = { rows: [row('F-001', 'B.xlsx/S', '', 'T')], omitted: 0, unread: 0 };

  expect(formulasOfColumn(formulas, [], legacy(''))).toEqual([]);
  expect(formulasOfColumn(formulas, [], legacy('  '))).toEqual([]);
});

it('RF-623 links neither table when the claim cites both of them', () => {
  const rows = [
    row('F-001', 'B.xlsx/Sales', 'Total', 'A'),
    row('F-002', 'B.xlsx/Costs', 'Total', 'B'),
  ];
  const formulas = { rows, omitted: 0, unread: 0 };
  const both = ['B.xlsx/Sales/values.md', 'B.xlsx/Costs/values.md'];
  const cited = card('ENT-001', 'ENT', 'Supported', both);

  expect(formulasOfColumn(formulas, [cited], legacy('Total'))).toEqual([]);
});

function task(rest: Partial<PlanTask>): PlanTask {
  return {
    ...{ id: 'T-001', title: 'Task', phase: 1, requirements: [], acceptanceCriteria: [] },
    ...{ invariant: '', riskClass: 'none', adds: [], probes: [], files: [] },
    ...{ identifiers: [], dependsOn: [], builds: [] },
    ...rest,
  };
}

const dataModel = {
  database: null,
  tables: [
    {
      ...{ name: 'invoice', purpose: 'Keeps invoices.', sources: ['ENT-001'] },
      columns: [
        {
          ...{ name: 'total', type: 'numeric', nullable: false, migrationRisk: '' },
          legacy: legacy('Total'),
        },
      ],
      ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
    },
  ],
  dropped: [],
};

it('RF-631 links only the supported claims of a rule card, and only for the table kind of item', () => {
  const rows = [row('F-001', 'B.xlsx/S', 'Total', 'T')];
  const formulas = { rows, omitted: 0, unread: 0 };
  const rejected = card('BR-001', 'BR', 'Rejected', ['B.xlsx/S/formulas.md']);
  const parts = {
    requirements: [{ id: 'REQ-001', title: 'R', statement: 'R.', sources: ['BR-001'] }],
    sources: [rejected],
    dataModel,
  };

  expect(formulasOfTask(formulas, task({ requirements: ['REQ-001'] }), parts)).toEqual([]);
  expect(formulasOfTask(formulas, task({ builds: ['items:invoice'] }), parts)).toEqual([]);
});
