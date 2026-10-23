import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseDataModelAnswer } from '../../../../src/application/plan/data-model-answer.js';

// RF-630..RF-638, RF-623, EV-31: a column the planner invented to fill a table (`some_asset_field_1`,
// `field_2`, `column_3`) and a repeated copy of a column the table already has (`invoice_date_2` for
// the same legacy field and type) are dropped and named; a real column that only looks alike stays.

const fixture = (name: string) =>
  readFile(new URL(`../../../fixtures/planner/${name}`, import.meta.url), 'utf8');

const legacy = (field: string, claim = 'ENT-001.c1') => ({ claim, field });
const col = (name: string, type = 'text', source: ReturnType<typeof legacy> | null = null) => ({
  ...{ name, type },
  legacy: source,
});
const tableOf = (name: string, columns: readonly object[]) => ({ name, columns });
const parse = (...tables: readonly object[]) => parseDataModelAnswer(JSON.stringify({ tables }));
const namesOf = (parsed: ReturnType<typeof parse>, at = 0) =>
  parsed?.draft.tables[at]?.columns.map((each) => each.name);

describe('parseDataModelAnswer: placeholder columns (recorded Asset Manager plan, EV-31)', () => {
  it('RF-623 drops the tables that hold only `some_*` columns and lists them', async () => {
    const parsed = parseDataModelAnswer(await fixture('data-model-am-placeholders.json'));

    expect(parsed?.draft.tables.map((each) => each.name)).toEqual(['product_master']);
    const items = parsed?.problems.map((each) => each.item) ?? [];
    expect(items).toEqual(
      expect.arrayContaining(['some_asset_field_1', 'some_transaction_field_1']),
    );
    expect(parsed?.problems.map((each) => each.field)).toEqual(
      expect.arrayContaining(['table inventory_stock_data', 'table stock_in_out_transaction_log']),
    );
  });
});

describe('parseDataModelAnswer: placeholder names', () => {
  it('RF-623 drops `some_x`, `field_N` and `column_N` and keeps the rest of the table', () => {
    const parsed = parse(
      tableOf('asset', [
        col('id', 'uuid'),
        col('some_asset_field_1'),
        col('field_3'),
        col('column_2'),
        col('column1'),
        col('field4'),
      ]),
    );

    expect(namesOf(parsed)).toEqual(['id']);
    expect(parsed?.problems.map((each) => each.item)).toEqual([
      'some_asset_field_1',
      'field_3',
      'column_2',
      'column1',
      'field4',
    ]);
    expect(parsed?.problems[0]?.reason).toContain('placeholder');
  });

  it('RF-623 keeps real columns that only look like a placeholder', () => {
    const parsed = parse(
      tableOf('asset', [
        col('field_name'),
        col('column_count', 'integer'),
        col('fields'),
        col('someone_id', 'uuid'),
        col('address_1'),
        col('address_2'),
      ]),
    );

    expect(namesOf(parsed)).toEqual([
      ...['field_name', 'column_count', 'fields', 'someone_id', 'address_1', 'address_2'],
    ]);
    expect(parsed?.problems).toEqual([]);
  });
});

describe('parseDataModelAnswer: repeated columns (recorded Invoice plan, EV-31)', () => {
  it('RF-623 drops `invoice_date_2` and `status_2` and keeps the first copy', async () => {
    const parsed = parseDataModelAnswer(await fixture('data-model-invoice-repeated.json'));

    const names = namesOf(parsed) ?? [];
    expect(names).toContain('invoice_date');
    expect(names).toContain('status');
    expect(names).not.toContain('invoice_date_2');
    expect(names).not.toContain('status_2');
    expect(parsed?.problems.map((each) => each.item)).toEqual(['invoice_date_2', 'status_2']);
    expect(parsed?.problems[0]?.reason).toContain('repeats');
  });
});

describe('parseDataModelAnswer: a copy is kept when it may differ', () => {
  it('RF-623 keeps `x_2` when `x` is not in the table', () => {
    const parsed = parse(tableOf('person', [col('id', 'uuid'), col('phone_2')]));

    expect(namesOf(parsed)).toEqual(['id', 'phone_2']);
  });

  it('RF-623 keeps `x_2` when its type differs from `x`', () => {
    const parsed = parse(
      tableOf('person', [
        col('amount', 'numeric(10,2)', legacy('Amount')),
        col('amount_2', 'text', legacy('Amount')),
      ]),
    );

    expect(namesOf(parsed)).toEqual(['amount', 'amount_2']);
  });

  it('RF-623 keeps `x_2` when it holds another legacy field than `x`', () => {
    const parsed = parse(
      tableOf('person', [
        col('phone', 'text', legacy('Home phone')),
        col('phone_2', 'text', legacy('Work phone')),
      ]),
    );

    expect(namesOf(parsed)).toEqual(['phone', 'phone_2']);
  });
});

describe('parseDataModelAnswer: further copies', () => {
  it('RF-623 keeps `x_2` when the columns name no legacy field (they cannot be shown the same)', () => {
    const parsed = parse(tableOf('person', [col('phone'), col('phone_2')]));

    expect(namesOf(parsed)).toEqual(['phone', 'phone_2']);
  });

  it('RF-623 drops every further copy `x_3` of the same field and type', () => {
    const same = legacy('Status');
    const parsed = parse(
      tableOf('invoice', [
        col('status', 'text', same),
        col('status_2', 'TEXT', same),
        col('status_3', 'text', same),
      ]),
    );

    expect(namesOf(parsed)).toEqual(['status']);
    expect(parsed?.problems).toHaveLength(2);
  });

  it('RF-623 the base column must be a real one: `some_x` and `some_x_2` are both placeholders', () => {
    const parsed = parse(tableOf('asset', [col('id', 'uuid'), col('some_x'), col('some_x_2')]));

    expect(namesOf(parsed)).toEqual(['id']);
    expect(parsed?.problems).toHaveLength(2);
  });
});
