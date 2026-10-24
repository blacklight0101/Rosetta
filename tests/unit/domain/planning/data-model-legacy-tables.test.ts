import { describe, expect, it } from 'vitest';
import { legacyTablesOf } from '../../../../src/domain/planning/data-model-legacy-tables.js';
import { card } from '../../../support/data-model-sqlserver-orders.js';

// P5-38, RF-623, ADR-013: tables copied from the legacy claims, read from prose with bounded steps.
// The claims are shortened statements of the public school-management benchmark app.

describe('legacyTablesOf', () => {
  it('RF-623 reads names, columns, types, keys and a foreign key from a claim', () => {
    const [table] = legacyTablesOf([
      card('ENT-001', 'ENT', 'Students', [
        'The students table has an identity id and columns name, Rnumber (int), age (smallint), gender (smallint, not null), amount (numeric 10,3). Gender is a foreign key to gender.id.',
      ]),
    ]);

    expect(table?.name).toBe('students');
    expect(table?.copiedFromLegacy).toBe(true);
    expect(table?.columns.map((column) => [column.name, column.type, column.nullable])).toEqual([
      ['id', '', false],
      ['name', '', true],
      ['Rnumber', 'int', true],
      ['age', 'smallint', true],
      ['gender', 'smallint', false],
      ['amount', 'numeric(10,3)', true],
    ]);
    expect(table?.primaryKey).toEqual(['id']);
    expect(table?.foreignKeys).toEqual([
      { columns: ['gender'], references: 'gender', referencedColumns: ['id'] },
    ]);
    expect(table?.columns[2]?.legacy).toEqual({ claim: 'ENT-001.c1', field: 'Rnumber' });
  });

  it('RF-623 reads a type that follows the name and a reference in brackets', () => {
    const [table] = legacyTablesOf([
      card('ENT-006', 'ENT', 'Services', [
        'The services table has id, name, recur (a foreign key to recurnames), and amount numeric(7,2).',
      ]),
    ]);

    expect(table?.columns.map((column) => `${column.name}:${column.type}`)).toEqual([
      'id:',
      'name:',
      'recur:',
      'amount:numeric(7,2)',
    ]);
    expect(table?.foreignKeys).toEqual([
      { columns: ['recur'], references: 'recurnames', referencedColumns: ['id'] },
    ]);
  });
});

describe('legacyTablesOf: claims that state no table', () => {
  it('RF-623 a claim that states no table, or an unsupported one, gives none', () => {
    const access = card('ENT-009', 'ENT', 'Access', [
      'Student data is read from the students table.',
    ]);
    const rejected = card('ENT-010', 'ENT', 'Rejected', ['The x table has id, name.']);

    expect(legacyTablesOf([access])).toEqual([]);
    expect(
      legacyTablesOf([
        {
          ...rejected,
          claims: rejected.claims.map((claim) => ({ ...claim, status: 'Rejected' as const })),
        },
      ]),
    ).toEqual([]);
  });

  it('ADR-013 a very long hostile claim is read in bounded time', () => {
    const text = `The t table has ${'a, '.repeat(200_000)}`;

    const started = Date.now();
    const [table] = legacyTablesOf([card('ENT-001', 'ENT', 'Big', [text])]);

    expect(Date.now() - started).toBeLessThan(1000);
    expect(table?.columns.length).toBeLessThanOrEqual(200);
  });
});
