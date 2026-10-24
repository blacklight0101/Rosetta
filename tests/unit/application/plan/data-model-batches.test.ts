import { describe, expect, it } from 'vitest';
import {
  dataModelWarnings,
  planDataModel,
} from '../../../../src/application/plan/plan-data-model.js';
import {
  answerTokensOf,
  batchBudget,
  dataModelBatches,
} from '../../../../src/application/plan/data-model-batches.js';
import { briefOf } from '../../../support/data-model-sqlserver-orders.js';
import { schoolEntities, scriptedPlanner } from '../../../support/batched-model-planner.js';

// P5-38, RF-623, RF-604: the data model is asked in batches sized to the output limit, a failed batch
// is retried smaller once, and what still fails is copied from the legacy claims and marked.

const brief = briefOf(null);

describe('dataModelBatches', () => {
  it('RF-623 groups the entities so each batch fits its share of the output limit', () => {
    const cards = schoolEntities(18);

    const batches = dataModelBatches(cards, 4_096);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat().map((each) => each.id)).toEqual(cards.map((each) => each.id));
    for (const batch of batches) {
      const total = batch.reduce((sum, each) => sum + answerTokensOf(each), 0);
      expect(batch.length === 1 || total <= batchBudget(4_096)).toBe(true);
    }
  });

  it('RF-623 a card larger than the budget is a batch of its own', () => {
    expect(dataModelBatches(schoolEntities(2), 100).map((batch) => batch.length)).toEqual([1, 1]);
  });
});

describe('planDataModel: batches (P5-38)', () => {
  it('RF-623 a recorded plan with 18 entities whose one-call answer is cut gives 18 tables', async () => {
    const { call, requests } = scriptedPlanner({ maxEntities: 6 });

    const planned = await planDataModel(call, { cards: schoolEntities(18), brief });

    expect(planned.assembly.model.tables).toHaveLength(18);
    expect(planned.copied).toEqual([]);
    expect(requests.length).toBeGreaterThan(1);
    for (const request of requests) {
      const message = request.messages.map((each) => each.content).join('\n');
      expect(message).toContain('otherEntities');
    }
  });

  it('RF-623 a batch that keeps failing has its tables copied from the legacy claims, marked', async () => {
    const { call } = scriptedPlanner({ maxEntities: 6, poison: 'ENT-005' });

    const planned = await planDataModel(call, { cards: schoolEntities(18), brief });

    const { tables } = planned.assembly.model;
    expect(tables).toHaveLength(18);
    const copied = tables.find((table) => table.name === 't005');
    expect(copied?.copiedFromLegacy).toBe(true);
    expect(copied?.columns.map((column) => `${column.name}:${column.type}`)).toEqual([
      'id:to confirm',
      'name:to confirm',
      'size:int',
      'due:numeric(10,3)',
      'kind:varchar(20)',
    ]);
    expect(copied?.primaryKey).toEqual(['id']);
    expect(copied?.foreignKeys).toEqual([
      { columns: ['kind'], references: 't001', referencedColumns: ['id'] },
    ]);
    expect(copied?.sources).toEqual(['ENT-005']);
    // Only the retried half that holds the failing entity is copied: its neighbour may go with it.
    expect(planned.copied).toContain('t005');
    expect(planned.copied.length).toBeLessThanOrEqual(2);
    expect(tables.filter((table) => table.copiedFromLegacy === true)).toHaveLength(
      planned.copied.length,
    );
    expect(planned.problems.some((problem) => problem.item === 't005')).toBe(true);
  });
});

describe('planDataModel: the retry (P5-38)', () => {
  it('RF-623 a failing batch is retried as two smaller ones before anything is copied', async () => {
    const { call, requests } = scriptedPlanner({ maxEntities: 2 });

    const planned = await planDataModel(call, { cards: schoolEntities(3), brief });

    expect(planned.copied).toEqual([]);
    expect(planned.assembly.model.tables).toHaveLength(3);
    expect(requests.length).toBeGreaterThanOrEqual(3);
  });
});

describe('planDataModel: a model never empty (P5-38)', () => {
  it('RF-623 the package never ends with an empty model while ENT cards exist', async () => {
    const { call } = scriptedPlanner({ maxEntities: 0 });
    const cards = schoolEntities(3).map((each) => ({
      ...each,
      claims: each.claims.map((claim) => ({ ...claim, text: 'Rows are kept.' })),
    }));

    const planned = await planDataModel(call, { cards, brief });

    expect(planned.assembly.model.tables.length).toBeGreaterThan(0);
    expect(planned.assembly.model.tables.every((table) => table.copiedFromLegacy === true)).toBe(
      true,
    );
  });

  it('RF-623 a small model is asked in one call, as before', async () => {
    const { call, requests } = scriptedPlanner({ maxEntities: 6 });

    await planDataModel(call, { cards: schoolEntities(2), brief });

    expect(requests).toHaveLength(1);
    const message = requests[0]?.messages.map((each) => each.content).join('') ?? '';
    expect(message).not.toContain('otherEntities');
  });
});

describe('planDataModel: unreadable answers and the cut-off cause (P5-38)', () => {
  it('RF-623 a whole answer that cannot be read is asked again once as two smaller batches', async () => {
    const { call, requests } = scriptedPlanner({ maxEntities: 6, garbage: true });

    const planned = await planDataModel(call, { cards: schoolEntities(3), brief });

    expect(requests).toHaveLength(3);
    expect(planned.copied).toHaveLength(3);
    expect(planned.assembly.model.tables.every((table) => table.copiedFromLegacy === true)).toBe(
      true,
    );
  });

  it('RST-1805 a batch that fell back after a cut says the cause and the setting', async () => {
    const { call } = scriptedPlanner({ maxEntities: 0 });

    const planned = await planDataModel(call, { cards: schoolEntities(3), brief });

    const warned = dataModelWarnings(planned).join(' ');
    expect(warned).toContain('copied from the legacy claims');
    expect(warned).toContain('cut off at 4096 output tokens');
    expect(warned).toContain('Planner max output tokens');
  });

  it('RF-623 the batches are exact for 18 entities at 4096 output tokens', () => {
    expect(dataModelBatches(schoolEntities(18), 4_096).map((batch) => batch.length)).toEqual([
      3, 3, 3, 3, 3, 3,
    ]);
  });
});
