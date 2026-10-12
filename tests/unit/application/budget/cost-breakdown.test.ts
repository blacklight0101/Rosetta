import { describe, expect, it } from 'vitest';
import { breakdownOf, totalsOf } from '../../../../src/application/budget/cost-breakdown.js';
import { costRunA, costRunB, groupOf } from '../../../support/cost-fixtures.js';

// RF-428, RF-1010, DEC-49, P1-36: the ledger groups added up into the totals of the header and the
// breakdown of the cost page.

const later = new Date('2026-10-12T11:00:00.000Z');

const ledger = [
  groupOf(),
  groupOf({
    calls: 2,
    inputTokens: 3000,
    outputTokens: 300,
    cachedInputTokens: 0,
    costMicros: 1_300n,
  }),
  groupOf({
    runId: costRunB,
    firstAt: later,
    stage: 'verify',
    role: 'verifier',
    provider: 'ollama',
    model: 'gemma4:e4b',
    keySource: 'none',
    costMicros: 0n,
    priceTableVersion: '2026-10-12',
  }),
  groupOf({ runId: null, stage: 'provider-test', role: 'reader', costMicros: 5n }),
];

describe('totalsOf', () => {
  it('RF-1010 adds tokens (input, output, cached), calls and the known cost per currency', () => {
    const totals = totalsOf([...ledger, groupOf({ currency: 'EUR', costMicros: 9n })]);

    expect(totals).toEqual({
      calls: 6,
      inputTokens: 7000,
      outputTokens: 700,
      cachedInputTokens: 200,
      cost: [
        { currency: 'EUR', costMicros: 9n },
        { currency: 'USD', costMicros: 2_005n },
      ],
      unknownCostCalls: 0,
      priceTableVersions: ['2026-10-11', '2026-10-12'],
    });
  });

  it('RF-1010 counts the calls of an unpriced model as unknown cost, not as zero', () => {
    const totals = totalsOf([groupOf(), groupOf({ costKnown: false, costMicros: 0n, calls: 3 })]);

    expect(totals.unknownCostCalls).toBe(3);
    expect(totals.cost).toEqual([{ currency: 'USD', costMicros: 700n }]);
  });

  it('RF-1010 is all zero for an empty ledger', () => {
    expect(totalsOf([])).toMatchObject({ calls: 0, inputTokens: 0, cost: [] });
  });
});

describe('breakdownOf', () => {
  it('RF-428 breaks the project down by run in the order the runs started, the tests last', () => {
    const { byRun } = breakdownOf(ledger);

    expect(byRun.map((line) => line.runId)).toEqual([costRunA, costRunB, null]);
    expect(byRun[0]?.totals).toMatchObject({ calls: 3, inputTokens: 4000 });
    expect(byRun[0]?.totals.cost).toEqual([{ currency: 'USD', costMicros: 2_000n }]);
    expect(byRun[2]).toMatchObject({ key: 'provider-tests', runId: null });
    expect(byRun[2]?.totals.cost).toEqual([{ currency: 'USD', costMicros: 5n }]);
  });

  it('RF-428 breaks it down by stage, role and provider in code-unit order', () => {
    const { byStage, byRole, byProvider } = breakdownOf(ledger);

    expect(byStage.map((line) => line.key)).toEqual(['provider-test', 'understand', 'verify']);
    expect(byRole.map((line) => [line.key, line.totals.calls])).toEqual([
      ['reader', 4],
      ['verifier', 1],
    ]);
    expect(byProvider.map((line) => [line.key, line.local])).toEqual([
      ['ollama', true],
      ['openai', false],
    ]);
  });

  it('RF-428 shows a local model with its tokens and a cost of zero', () => {
    const { byModel } = breakdownOf(ledger);

    const local = byModel.find((line) => line.model === 'gemma4:e4b');
    expect(local).toMatchObject({ provider: 'ollama', local: true });
    expect(local?.totals).toMatchObject({ inputTokens: 1000, outputTokens: 100 });
    expect(local?.totals.cost).toEqual([{ currency: 'USD', costMicros: 0n }]);
  });

  it('RF-428 keeps the cost fixed at call time and the price table version of each line', () => {
    const { byRun } = breakdownOf(ledger);

    expect(byRun[1]?.totals.priceTableVersions).toEqual(['2026-10-12']);
    expect(byRun[0]?.totals.priceTableVersions).toEqual(['2026-10-11']);
  });

  it('RF-428 has the same totals as the header for the same groups', () => {
    expect(breakdownOf(ledger).totals).toEqual(totalsOf(ledger));
  });
});
