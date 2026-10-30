import { describe, expect, it } from 'vitest';
import {
  fitLengths,
  unconfirmedTypes,
} from '../../../../src/application/plan/data-model-type-fit.js';
import type { ModelColumn, TargetDataModel } from '../../../../src/domain/planning/data-model.js';
import { card } from '../../../support/data-model-sqlserver-orders.js';
import { stockCards } from '../../../support/data-model-defect-cards.js';

// P7-13, RF-623, EV-75: a character column is long enough for the longest value its sources list (a
// list validation, an enum, a constant); a shorter length is widened to fit and noted. A column
// still typed "to confirm" is listed.

function column(name: string, type: string, field: string | null = null): ModelColumn {
  const legacy = field === null ? null : { cardId: 'ENT-003', claimId: 'ENT-003.c1', field };
  return { name, type, nullable: true, legacy, migrationRisk: '' };
}

function modelOf(columns: readonly ModelColumn[], checks: readonly string[] = []): TargetDataModel {
  const table = {
    ...{ name: 'stock_in_out', purpose: 'Keeps rows.', sources: ['ENT-003'], columns },
    ...{ primaryKey: [], uniqueKeys: [], foreignKeys: [], checks, indexes: [] },
  };
  return { database: 'SQL Server', tables: [table], dropped: [] };
}

const typeOf = (model: TargetDataModel, name: string) =>
  model.tables[0]?.columns.find((each) => each.name === name)?.type;

describe('fitLengths: the list validation of the Asset Manager (EV-75)', () => {
  it('RF-623 widens varchar(3) to hold Opening Stock, which the list validation of BR-007 names', () => {
    const model = modelOf(
      [column('movement_type', 'varchar(3)', 'In/Out')],
      ['movement_type is IN or OUT'],
    );

    const fitted = fitLengths(model, stockCards());

    expect(typeOf(fitted.model, 'movement_type')).toBe('varchar(13)');
    expect(fitted.problems).toHaveLength(1);
    expect(fitted.problems[0]).toMatchObject({
      item: 'movement_type',
      field: 'table stock_in_out columns',
    });
    expect(fitted.problems[0]?.reason).toContain('3');
    expect(fitted.problems[0]?.reason).toContain('13');
  });

  it('RF-623 reads the values of the model check of the table when no card lists them', () => {
    const model = modelOf(
      [column('state', 'char(3)')],
      ['state is one of REPAIR, DAMAGED or USABLE'],
    );

    expect(typeOf(fitLengths(model, []).model, 'state')).toBe('char(7)');
  });

  it('RF-623 reads a list in a claim that names the column or its legacy field', () => {
    const cards = [
      card('BR-001', 'BR', 'Status values', [
        "The Status column accepts only 'Open', 'Closed' or 'On hold'.",
      ]),
    ];
    const model = modelOf([column('status', 'nvarchar(5)', 'Status')]);

    expect(typeOf(fitLengths(model, cards).model, 'status')).toBe('nvarchar(7)');
  });

  it('RF-623 reads a list of IN,OUT,Opening Stock written without spaces', () => {
    const cards = [
      card('BR-001', 'BR', 'List', [
        'The type column has the list validation IN,OUT,Opening Stock.',
      ]),
    ];
    const model = modelOf([column('type', 'varchar(3)')]);

    expect(typeOf(fitLengths(model, cards).model, 'type')).toBe('varchar(13)');
  });
});

describe('fitLengths: what stays', () => {
  it('RF-623 leaves a length that already fits, with no note', () => {
    const model = modelOf(
      [column('movement_type', 'varchar(20)', 'In/Out')],
      ['movement_type is IN or OUT'],
    );

    const fitted = fitLengths(model, stockCards());

    expect(fitted.model).toEqual(model);
    expect(fitted.problems).toEqual([]);
  });

  it('RF-623 leaves max, no length, a number and a list that is not about the column', () => {
    const model = modelOf(
      [
        column('a', 'varchar(max)'),
        column('b', 'text'),
        column('c', 'int'),
        column('d', 'varchar(3)'),
      ],
      ['d is one of A or B'],
    );

    const fitted = fitLengths(model, stockCards());

    expect(fitted.model).toEqual(model);
    expect(fitted.problems).toEqual([]);
  });

  it('RF-623 does not tie a list to a column that shares one value with it by chance', () => {
    const model = modelOf([column('direction', 'varchar(3)')], ['direction is IN or UP']);

    expect(typeOf(fitLengths(model, stockCards()).model, 'direction')).toBe('varchar(3)');
  });
});

describe('unconfirmedTypes', () => {
  it('RF-623 lists each column still typed to confirm', () => {
    const model = modelOf([column('description', 'to confirm'), column('id', 'int')]);

    const problems = unconfirmedTypes(model);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ item: 'description', field: 'table stock_in_out columns' });
    expect(problems[0]?.reason).toContain('to confirm');
  });

  it('RF-623 lists nothing for a model with every type named', () => {
    expect(unconfirmedTypes(modelOf([column('id', 'int')]))).toEqual([]);
  });
});
