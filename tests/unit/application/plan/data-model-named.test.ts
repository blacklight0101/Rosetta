import { describe, expect, it } from 'vitest';
import { missingNamed, ruleCandidates } from '../../../../src/application/plan/data-model-named.js';
import { card, ordersCards, recordedModel } from '../../../support/data-model-sqlserver-orders.js';

// P3-120, RF-623: a column or table a requirement or rule card names, and the model lacks, is listed.

describe('missingNamed', () => {
  it('RF-623 lists status_id and tblStatus, named by the rule card, missing from the wrong answer', async () => {
    const problems = missingNamed(await recordedModel('wrong'), ordersCards());

    expect(problems.map((each) => each.item).sort()).toEqual(['status_id', 'tblStatus']);
    expect(problems[0]?.field).toContain('BR-001.c1');
  });

  it('RF-623 lists nothing when the model has the column and the table (recorded right answer)', async () => {
    expect(missingNamed(await recordedModel('right'), ordersCards())).toEqual([]);
  });

  it('RF-623 counts a dropped legacy field as present', async () => {
    const model = await recordedModel('wrong');
    const dropped = ['status_id', 'tblStatus'].map((field) => ({
      ...{ cardId: 'ENT-001', claimId: 'ENT-001.c1', field },
      reason: 'Not needed.',
      byPlanner: true,
    }));

    expect(missingNamed({ ...model, dropped }, ordersCards())).toEqual([]);
  });

  it('RF-623 reads requirement and rule cards only', async () => {
    const feature = ordersCards().map((card) =>
      card.type === 'ENT' ? card : { ...card, type: 'FEAT' as const },
    );
    const model = await recordedModel('wrong');

    expect(missingNamed(model, feature)).toHaveLength(2);
    expect(
      missingNamed(
        model,
        ordersCards().filter((card) => card.type === 'ENT'),
      ),
    ).toEqual([]);
  });
});

describe('missingNamed: noise and cap', () => {
  it('RF-623 skips code identifiers and names the legacy evidence does not mention', async () => {
    const noise = card('BR-009', 'BR', 'Noise', [
      'Uses `ICatalogService`, `btnSave`, `int`, `CatalogMock`, on_click, page_load and get_by_id.',
      'The to_do list and the web_config are unrelated.',
    ]);

    expect(missingNamed(await recordedModel('wrong'), [...ordersCards(), noise])).toHaveLength(2);
  });

  it('RF-623 lists at most 20 names, then says how many more', async () => {
    const names = Array.from({ length: 30 }, (_unused, at) => `col_${String(at)}x`);
    const entity = card('ENT-009', 'ENT', 'Columns', [names.join(' ')]);
    const rule = card('BR-010', 'BR', 'Many', [names.map((name) => `\`${name}\``).join(' ')]);

    const problems = missingNamed(await recordedModel('right'), [entity, rule]);

    expect(problems).toHaveLength(21);
    expect(problems[20]?.item).toBe('and 10 more');
  });
});

describe('ruleCandidates', () => {
  it('RF-623 keeps only the rule claims that name something the entity cards mention', () => {
    const kept = ruleCandidates([
      ...ordersCards(),
      card('BR-011', 'BR', 'Sorting', [
        'Orders are sorted by date.',
        'Unknown rows use the sort_key.',
      ]),
    ]);

    expect(kept.map((each) => each.id)).toEqual(['BR-001']);
  });
});

describe('data-shaped names the entity cards never mention', () => {
  const cards = [
    card('ENT-001', 'ENT', 'Orders', ['tblOrders(id int, total money) holds the orders.']),
    card('BR-001', 'BR', 'Deleted', [
      'Status 6 means deleted in tblStatus; the rule uses status_id.',
    ]),
  ];

  it('RF-623 lists tblStatus and status_id, though no entity card mentions them', async () => {
    const problems = missingNamed(await recordedModel('wrong'), cards);

    expect(problems.map((each) => each.item).sort()).toEqual(['status_id', 'tblStatus']);
  });

  it('RF-623 sends such a rule claim to the data-model call', () => {
    expect(ruleCandidates(cards).map((each) => each.id)).toEqual(['BR-001']);
  });
});

describe('missingNamed: names stated as a table (P5-33)', () => {
  const entity = card('ENT-001', 'ENT', 'Orders', [
    'tblOrders(id int, total money) holds the orders.',
  ]);

  it('P5-33 does not list a form field name as a missing table', async () => {
    const form = card('BR-020', 'BR', 'Search', [
      'The search page reads the order number from the field txt_order_id and tblOrders.',
      'The input ddl_status_id picks the status; the control `btn_order_save` saves, and order_ref field is read.',
    ]);

    const problems = missingNamed(await recordedModel('right'), [entity, form]);

    expect(problems.map((each) => each.item)).toEqual([]);
  });

  it('P5-33 still lists a lookup table a card calls a table, whatever its shape', async () => {
    const rule = card('BR-021', 'BR', 'Lookup', [
      'Prices come from the status_lookup table.',
      'The query is SELECT name FROM region_names JOIN price_bands ON 1 = 1.',
    ]);

    const problems = missingNamed(await recordedModel('right'), [entity, rule]);

    expect(problems.map((each) => each.item).sort()).toEqual([
      'price_bands',
      'region_names',
      'status_lookup',
    ]);
  });

  it('P5-33 a form control name that is also stated as a table is still listed', async () => {
    const rule = card('BR-022', 'BR', 'Odd', ['Rows come from the txt_order_log table.']);

    const problems = missingNamed(await recordedModel('right'), [entity, rule]);

    expect(problems.map((each) => each.item)).toEqual(['txt_order_log']);
  });
});

describe('missingNamed: words near a name do not hide it (P5-33)', () => {
  const entity = card('ENT-001', 'ENT', 'Orders', [
    'tblOrders(id int, total money) holds the orders.',
  ]);

  it.each([
    ['The dropdown is filled by lkp_status and the button saves.', 'lkp_status'],
    ['Each button press reads lkp_region for the list.', 'lkp_region'],
    ['Look up the region_names in the checkbox list.', 'region_names'],
  ])('P5-33 lists the name in: %s', async (text, name) => {
    const problems = missingNamed(await recordedModel('right'), [
      entity,
      card('BR-030', 'BR', 'Words', [text]),
    ]);

    expect(problems.map((each) => each.item)).toEqual([name]);
  });
});
