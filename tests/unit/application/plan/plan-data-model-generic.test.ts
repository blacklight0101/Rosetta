import { describe, expect, it } from 'vitest';
import { planDataModel } from '../../../../src/application/plan/plan-data-model.js';
import { briefOf, card } from '../../../support/data-model-sqlserver-orders.js';
import { scriptedPlanner } from '../../../support/batched-model-planner.js';

// RF-623, P8-07, EV-31, EV-40: a table whose name is a generic suffix and that maps no legacy column
// is a line in the Data model checks (the table stays). Synthetic names only.

const cards = [
  card('ENT-001', 'ENT', 'Crate group sheet', ['The crate_group table has group_id and label.']),
];

const column = (name: string, claim: string | null) => ({
  ...{ name, type: 'varchar(50)', nullable: true },
  legacy: claim === null ? null : { claim, field: name },
});
const table = (name: string, legacy: boolean) => ({
  ...{ name, purpose: 'Keeps rows.', sources: ['ENT-001'], primaryKey: [], uniqueKeys: [] },
  ...{ foreignKeys: [], checks: [], indexes: [] },
  columns: [column('group_id', legacy ? 'ENT-001.c1' : null), column('total', null)],
});

async function plannedWith(tables: unknown[]) {
  const answer = JSON.stringify({ tables, dropped: [] });
  const { call } = scriptedPlanner({ maxEntities: 20, answer });
  return planDataModel(call, { cards, brief: briefOf('SQL Server') });
}

describe('planDataModel: a table with a generic name and no source column', () => {
  it('RF-623 lists a table named ..._outputs that maps no legacy column, and keeps it', async () => {
    const result = await plannedWith([table('crate_group_outputs', false)]);

    expect(result.assembly.model.tables.map((each) => each.name)).toEqual(['crate_group_outputs']);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ item: 'crate_group_outputs', kind: 'check' }),
    );
  });

  it('RF-623 lists a table named ..._entity that maps no legacy column', async () => {
    const result = await plannedWith([table('crate_type_entity', false)]);

    expect(result.problems.map((each) => each.item)).toContain('crate_type_entity');
  });

  it('RF-623 does not list a generic name whose table maps a legacy column', async () => {
    const result = await plannedWith([table('crate_group_outputs', true)]);

    expect(result.problems.map((each) => each.item)).not.toContain('crate_group_outputs');
  });

  it('RF-623 does not list a plain name with no source column', async () => {
    const result = await plannedWith([table('crate_group', false)]);

    expect(result.problems.map((each) => each.item)).not.toContain('crate_group');
  });
});
