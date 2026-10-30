import { describe, expect, it } from 'vitest';
import { parseDataModelAnswer } from '../../../../src/application/plan/data-model-answer.js';
import { typeOrUnconfirmed } from '../../../../src/domain/planning/data-model-names.js';
import { answerText } from '../../../support/data-model-defect-cards.js';

// P7-13, RF-623, EV-31, EV-40: a column whose name describes work (a metric used to derive a status,
// a range used for lookups) is not a field of the data and is dropped and named; a real column that
// only looks alike stays. A size of max is a size.

const legacy = (field: string) => ({ claim: 'ENT-001.c1', field });
const col = (name: string, field: string | null = null) => ({
  ...{ name, type: 'varchar(20)' },
  legacy: field === null ? null : legacy(field),
});
const parse = (...columns: readonly object[]) =>
  parseDataModelAnswer(
    JSON.stringify({ tables: [{ name: 't', columns: [col('id'), ...columns] }] }),
  );
const kept = (parsed: ReturnType<typeof parse>) =>
  parsed?.draft.tables[0]?.columns.map((each) => each.name);

describe('parseDataModelAnswer: columns that describe work (Asset Manager, Ollama)', () => {
  it('RF-623 keeps product_id and drops metrics_to_derive_status and valuation_lookup_range', async () => {
    const parsed = parseDataModelAnswer(await answerText('data-model-asset-manager-ollama'));

    expect(parsed?.draft.tables[0]?.columns.map((each) => each.name)).toEqual(['product_id']);
    expect(parsed?.problems.map((each) => each.item)).toEqual([
      'metrics_to_derive_status',
      'valuation_lookup_range',
    ]);
    expect(parsed?.problems[0]?.reason).toContain('work');
  });

  it.each(['metrics_to_derive_status', 'metrics_used_to_derive_status', 'price_lookup_range'])(
    'RF-623 drops %s',
    (name) => {
      expect(kept(parse(col(name)))).toEqual(['id']);
    },
  );

  it('RF-623 drops a column whose legacy field is a cell range description', () => {
    const parsed = parse(col('valuation_data', 'Range D:N contains data referenced'));

    expect(kept(parsed)).toEqual(['id']);
  });

  it.each([
    'ship_to_address',
    'bill_to_id',
    'date_to',
    'price_range',
    'lookup_code',
    'derived_status',
    'status_to_date',
    'metric_value',
    ...['discount_to_apply', 'rate_to_apply', 'amount_to_convert', 'date_to_check'],
    ...['quantity_used_by_job', 'materials_used_for_repair', 'tax_to_calculate'],
    ...['items_to_generate', 'country_lookup_values', 'lookup_table', 'units_to_validate'],
  ])('RF-623 keeps %s', (name) => {
    expect(kept(parse(col(name, 'Ship to')))).toEqual(['id', name]);
  });
});

describe('typeOrUnconfirmed: max', () => {
  it.each(['nvarchar(max)', 'varchar(MAX)', 'varbinary(max)'])(
    'RF-623 takes %s as a type',
    (type) => {
      expect(typeOrUnconfirmed(type)).toBe(type);
    },
  );

  it('RF-603 still refuses a statement in the size', () => {
    expect(typeOrUnconfirmed('varchar(max); drop table x')).toBe('to confirm');
    expect(typeOrUnconfirmed('varchar(maximum)')).toBe('to confirm');
  });
});
