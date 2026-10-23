import { describe, expect, it } from 'vitest';
import { keepLegacyKeys } from '../../../../src/application/plan/data-model-legacy-keys.js';
import {
  briefOf,
  ordersCards,
  recordedModel,
} from '../../../support/data-model-sqlserver-orders.js';

// P3-120, RF-623: a key the legacy SQL shows as an integer stays an integer unless the brief asks
// otherwise; a key that changes type gets a migration note in the model and a line in checks.md.

describe('keepLegacyKeys', () => {
  it('RF-623 lists a uuid key over a legacy int key and writes the migration note (recorded wrong answer)', async () => {
    const model = await recordedModel('wrong');

    const checked = keepLegacyKeys(model, ordersCards(), briefOf('SQL Server'));

    expect(checked.problems).toHaveLength(1);
    expect(checked.problems[0]).toMatchObject({ item: 'id', field: 'table orders columns' });
    expect(checked.problems[0]?.reason).toContain('integer');
    expect(checked.problems[0]?.reason).toContain('does not ask');
    const key = checked.model.tables[0]?.columns.find((each) => each.name === 'id');
    expect(key?.type).toBe('uuid');
    expect(key?.migrationRisk).toContain('migration');
    expect(key?.migrationRisk).toContain('uuid');
  });

  it('RF-623 still lists the change when the brief asks for it, and says so', async () => {
    const brief = briefOf('SQL Server', 'Move to uuid keys in the new system.');

    const checked = keepLegacyKeys(await recordedModel('wrong'), ordersCards(), brief);

    expect(checked.problems).toHaveLength(1);
    expect(checked.problems[0]?.reason).toContain('brief asks');
    expect(checked.model.tables[0]?.columns[0]?.migrationRisk).toContain('migration');
  });
});

describe('keepLegacyKeys: what stays', () => {
  it('RF-623 keeps the planner note when it wrote one', async () => {
    const model = await recordedModel('wrong');
    const table = model.tables[0];
    if (table === undefined) throw new Error('no table');
    const note = 'Old ids are mapped to new ones.';
    const noted = {
      ...model,
      tables: [
        {
          ...table,
          columns: table.columns.map((each) =>
            each.name === 'id' ? { ...each, migrationRisk: note } : each,
          ),
        },
      ],
    };

    const checked = keepLegacyKeys(noted, ordersCards(), briefOf('SQL Server'));

    expect(checked.model.tables[0]?.columns[0]?.migrationRisk).toBe(note);
    expect(checked.problems).toHaveLength(1);
  });

  it('RF-623 says nothing when the integer key stays (recorded right answer)', async () => {
    const model = await recordedModel('right');

    const checked = keepLegacyKeys(model, ordersCards(), briefOf('SQL Server'));

    expect(checked.problems).toEqual([]);
    expect(checked.model).toEqual(model);
  });

  it('RF-623 says nothing about a uuid key when the cards show no integer key', async () => {
    const plain = 'An order has a total.';
    const cards = ordersCards().map((card) => ({
      ...card,
      claims: card.claims.map((claim) => ({ ...claim, text: plain })),
    }));

    const checked = keepLegacyKeys(await recordedModel('wrong'), cards, briefOf('SQL Server'));

    expect(checked.problems).toEqual([]);
  });
});
