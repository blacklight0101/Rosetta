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
        'Unknown rows use tblNothing.',
      ]),
    ]);

    expect(kept.map((each) => each.id)).toEqual(['BR-001']);
  });
});
