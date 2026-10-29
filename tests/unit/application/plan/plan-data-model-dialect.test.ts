import { describe, expect, it } from 'vitest';
import { planDataModel } from '../../../../src/application/plan/plan-data-model.js';
import { briefOf } from '../../../support/data-model-sqlserver-orders.js';
import { answerText, stockCards } from '../../../support/data-model-defect-cards.js';
import { scriptedPlanner } from '../../../support/batched-model-planner.js';

// P7-13, RF-623, EV-74, EV-75: the Asset Manager answer of the Haiku evaluation (integer, numeric
// and varchar columns on SQL Server) planned through planDataModel.

async function planned() {
  const answer = await answerText('data-model-asset-manager-haiku');
  const { call } = scriptedPlanner({ maxEntities: 9, answer });
  return planDataModel(call, { cards: stockCards(), brief: briefOf('SQL Server') });
}

describe('planDataModel: the dialect of one model', () => {
  it('RF-623 writes integer as int, so one model holds one dialect (EV-75)', async () => {
    const { assembly } = await planned();

    const types = assembly.model.tables.flatMap((table) => table.columns.map((c) => c.type));
    expect(types).not.toContain('integer');
    expect(types.filter((type) => type === 'int')).toHaveLength(5);
  });

  it('RF-623 lists nothing about integer: no column the model keeps is a problem (EV-74)', async () => {
    const { problems } = await planned();

    expect(problems.filter((each) => each.reason.includes('integer'))).toEqual([]);
  });

  it('RF-623 marks every problem about a kept column as a check, not a dropped part', async () => {
    const { problems, flagged } = await planned();

    const split = problems.length - flagged;
    expect(problems.slice(split).every((each) => each.kind === 'check')).toBe(true);
    expect(problems.slice(0, split).every((each) => each.kind === undefined)).toBe(true);
  });
});
