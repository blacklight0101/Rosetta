import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../../src/domain/runs/run-event.js';
import type { PriceTable } from '../../../src/domain/budget/price-table.js';
import { budgetTable } from '../../support/budget-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT, useSharedFullRun } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-421, RF-1003, RF-1010, ADR-007, P1-96: a recorded understand run publishes `usage.recorded`
// for every call, so the live run page has a cost for each role and agent: zero for a local model
// (the fake, priced like Ollama), the priced cost for a paid one, adding up to the run's ledger.

const temp = useTempRoot('rosetta-understand-usage-');
const full = useSharedFullRun('rosetta-understand-usage-shared-');

const usageOf = (events: readonly RunEvent[]): readonly RunEvent[] =>
  events.filter((event) => event.type === 'usage.recorded');

function costsOf(usage: readonly RunEvent[]): number[] {
  return usage.map((event) => Number(event.data['costMicros']));
}

/** The fake reader at a price, so its calls cost money like a cloud model's. */
const pricedTable: PriceTable = {
  ...budgetTable,
  prices: [
    ...budgetTable.prices,
    {
      provider: 'fake',
      model: 'fake-model',
      inputPerMillionMicros: 1_000_000n,
      cachedInputPerMillionMicros: 100_000n,
      outputPerMillionMicros: 2_000_000n,
      currency: 'USD',
    },
  ],
};

describe('an understand run: usage events', () => {
  it('RF-1003 publishes one usage.recorded per call, for its role and agent task, after the agent started', async () => {
    const { h, run } = full.current();

    const events = await h.eventsOf(run);
    const usage = usageOf(events);
    expect(usage).toHaveLength(8);
    expect(new Set(usage.map((event) => event.data['role']))).toEqual(new Set(['reader']));
    expect(usage.map((event) => event.agentTaskId)).toEqual([
      ...['reader-001', 'reader-001', 'reader-002', 'reader-003', 'reader-004'],
      ...['reader-005', 'reader-005', 'reader-005'],
    ]);
    for (const event of usage) {
      const started = events.find(
        (each) => each.type === 'agent.started' && each.agentTaskId === event.agentTaskId,
      );
      expect(started?.seq).toBeLessThan(event.seq);
    }
  });
});

describe('an understand run: usage costs', () => {
  it('RF-1003 a local model gives every call a cost of zero, never an unknown cost', async () => {
    const { h, run } = full.current();

    const usage = usageOf(await h.eventsOf(run));

    expect(costsOf(usage)).toEqual(Array.from({ length: 8 }, () => 0));
    expect(usage.at(-1)?.data).toMatchObject({
      runTotals: { inputTokens: 8_800, outputTokens: 1_090, costMicros: 0 },
      projectTotals: { inputTokens: 8_800, outputTokens: 1_090, costMicros: 0 },
    });
  });

  it(
    'RF-421 RF-1003 a paid model gives each call its ledger cost, adding up to the run total',
    async () => {
      const dataDir = temp.path;
      const h = await createUnderstandHarness({
        dataDir,
        recording: 'understand-csharp-full.json',
        priceTable: pricedTable,
      });
      await h.scan();
      const run = await h.understand();

      const usage = usageOf(await h.eventsOf(run));
      const rows = await h.providers.ledger.runEntries(run.userId, run.id);
      expect(costsOf(usage)).toEqual(rows.map((row) => Number(row.costMicros)));
      const total = costsOf(usage).reduce((sum, cost) => sum + cost, 0);
      expect(total).toBeGreaterThan(0);
      expect(usage.at(-1)?.data).toMatchObject({ runTotals: { costMicros: total } });
      expect((await h.manifestOf(run)).totals.costMicros).toBe(total);
    },
    UNDERSTAND_TIMEOUT.timeout,
  );
});
