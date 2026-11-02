import { describe, expect, it } from 'vitest';
import {
  applyColumnFacts,
  columnFactsOf,
} from '../../../../src/application/plan/data-model-column-facts.js';
import type { ModelColumn, TargetDataModel } from '../../../../src/domain/planning/data-model.js';
import { card } from '../../../support/data-model-sqlserver-orders.js';

// P7-13, RF-623, EV-75: a "to confirm" type takes the type of the legacy column when its source
// names one in the form of the reader prompt; otherwise it stays (and checks.md lists it).

function column(name: string, type: string): ModelColumn {
  const legacy = { cardId: 'ENT-003', claimId: 'ENT-003.c1', field: name };
  return { name, type, nullable: true, legacy, migrationRisk: '' };
}

function modelOf(database: string | null, ...columns: ModelColumn[]): TargetDataModel {
  const table = {
    ...{ name: 'catalog', purpose: 'Keeps rows.', sources: ['ENT-003'], columns },
    ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks: [], indexes: [] },
  };
  return { database, tables: [table], dropped: [] };
}

const cards = [
  card('ENT-003', 'ENT', 'Catalog', [
    'Column Catalog.Description: nvarchar(max), NULL; Column Catalog.PictureFileName: varchar(500), NULL.',
  ]),
];

const typesOf = (model: TargetDataModel) => model.tables[0]?.columns.map((each) => each.type);

describe('columnFactsOf: a size of max', () => {
  it('RF-623 reads nvarchar(max) as a type', () => {
    expect(columnFactsOf('Column Catalog.Description: nvarchar(max), NULL.')).toEqual([
      { name: 'Description', type: 'nvarchar(max)', nullable: true, default: '' },
    ]);
  });
});

describe('applyColumnFacts: to confirm', () => {
  it('RF-623 gives a to confirm column the type its legacy claim names', () => {
    const model = modelOf('SQL Server', column('description', 'to confirm'));

    const checked = applyColumnFacts(model, cards);

    expect(typesOf(checked.model)).toEqual(['nvarchar(max)']);
    expect(checked.problems).toEqual([]);
  });

  it('RF-623 keeps to confirm when the legacy type is not a type of the database', () => {
    const odd = [card('ENT-003', 'ENT', 'Catalog', ['Column Catalog.Description: uuid, NULL.'])];
    const model = modelOf('SQL Server', column('description', 'to confirm'));

    expect(typesOf(applyColumnFacts(model, odd).model)).toEqual(['to confirm']);
  });

  it('RF-623 keeps to confirm when the claim names no type, and takes any type when the database is not known', () => {
    const none = [card('ENT-003', 'ENT', 'Catalog', ['The catalog has a description.'])];
    expect(
      typesOf(
        applyColumnFacts(modelOf('SQL Server', column('description', 'to confirm')), none).model,
      ),
    ).toEqual(['to confirm']);
    expect(
      typesOf(
        applyColumnFacts(modelOf(null, column('picture_file_name', 'to confirm')), cards).model,
      ),
    ).toEqual(['varchar(500)']);
  });
});
