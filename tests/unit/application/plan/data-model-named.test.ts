import { describe, expect, it } from 'vitest';
import { missingNamed } from '../../../../src/application/plan/data-model-named.js';
import { ordersCards, recordedModel } from '../../../support/data-model-sqlserver-orders.js';

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
