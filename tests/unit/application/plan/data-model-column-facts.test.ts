import { describe, expect, it } from 'vitest';
import {
  applyColumnFacts,
  columnFactsOf,
} from '../../../../src/application/plan/data-model-column-facts.js';
import { staffCards, staffModel } from '../../../support/data-model-column-facts.js';

// P5-37, RF-623: a column takes its type, nullability and default from the entity claim that states
// it; a change the planner kept is listed with its reason; a change it gave no reason for is undone.

function columnOf(model: Awaited<ReturnType<typeof staffModel>>, name: string) {
  const found = model.tables[0]?.columns.find((each) => each.name === name);
  if (found === undefined) throw new Error(`no column ${name}`);
  return found;
}

describe('columnFactsOf', () => {
  it('RF-623 reads the type, nullability and default of a column claim', () => {
    expect(columnFactsOf('Column Staff.Patients_Treated: int, NOT NULL, default 0.')).toEqual([
      { name: 'Patients_Treated', type: 'int', nullable: false, default: '0' },
    ]);
    expect(columnFactsOf('Column Price: decimal(10, 2), NULL, default 1.50, primary key.')).toEqual(
      [{ name: 'Price', type: 'decimal(10, 2)', nullable: true, default: '1.50' }],
    );
  });

  it('RF-623 reads a quoted default and several columns in one claim', () => {
    const facts = columnFactsOf(
      "Column T.A: varchar(5), NOT NULL, default 'n/a'; Column T.B: double precision, NULL.",
    );

    expect(facts.map((each) => [each.name, each.type, each.default])).toEqual([
      ['A', 'varchar(5)', "'n/a'"],
      ['B', 'double precision', ''],
    ]);
  });

  it('RF-623 reads nothing from a claim that is not in the form, or from a very long one', () => {
    expect(columnFactsOf('tblOrders(id int, total decimal(10,2)) is read by a query.')).toEqual([]);
    expect(columnFactsOf(`Column T.A: ${'x'.repeat(5000)}`)).toEqual([]);
  });
});

describe('applyColumnFacts (recorded wrong answer for PostgreSQL)', () => {
  it('RF-623 keeps the float, NOT NULL and the default the legacy claims state', async () => {
    const checked = applyColumnFacts(await staffModel(), staffCards());

    expect(columnOf(checked.model, 'rating')).toMatchObject({ type: 'float', nullable: false });
    expect(columnOf(checked.model, 'name')).toMatchObject({ type: 'varchar(30)', nullable: false });
    expect(columnOf(checked.model, 'patients_treated')).toMatchObject({
      type: 'int',
      nullable: false,
      default: '0',
    });
  });

  it('RF-623 lists a change the planner kept with its reason, and leaves the column as written', async () => {
    const checked = applyColumnFacts(await staffModel(), staffCards());

    const salary = columnOf(checked.model, 'salary');
    expect(salary.type).toBe('numeric(10,2)');
    expect(salary.migrationRisk).toContain('rounded');
    const listed = checked.problems.find((each) => each.item === 'salary');
    expect(listed).toMatchObject({ field: 'table staff columns' });
    expect(listed?.reason).toContain('float');
    expect(listed?.reason).toContain('numeric(10,2)');
  });

  it('RF-623 lists a legacy type that is not a type of the chosen database, and writes the reason', async () => {
    const checked = applyColumnFacts(await staffModel(), staffCards());

    const address = columnOf(checked.model, 'address');
    expect(address.type).toBe('varchar(60)');
    expect(address.nullable).toBe(true);
    expect(address.migrationRisk).toContain('nvarchar(60)');
    expect(address.migrationRisk).toContain('PostgreSQL');
    expect(checked.problems.some((each) => each.item === 'address')).toBe(true);
  });

  it('RF-623 says nothing about a column that already matches its claim', async () => {
    const checked = applyColumnFacts(await staffModel(), staffCards());

    expect(checked.problems.some((each) => each.item === 'name')).toBe(false);
    expect(columnOf(checked.model, 'name').migrationRisk).toBe('');
  });
});

describe('applyColumnFacts: other cases', () => {
  it('RF-623 takes the legacy type when no database was chosen', async () => {
    const checked = applyColumnFacts(await staffModel(null), staffCards());

    expect(columnOf(checked.model, 'rating').type).toBe('float');
    expect(columnOf(checked.model, 'address').type).toBe('nvarchar(60)');
  });

  it('RF-623 leaves a column with no legacy claim, and a claim not in the form, alone', async () => {
    const model = await staffModel();
    const plain = staffCards().map((each) => ({
      ...each,
      claims: each.claims.map((claim) => ({ ...claim, text: 'Staff holds members.' })),
    }));

    const checked = applyColumnFacts(model, plain);

    expect(checked.model).toEqual(model);
    expect(checked.problems).toEqual([]);
  });
});
