import { describe, expect, it } from 'vitest';
import { buildCostReport } from '../../../../src/application/budget/cost-report.js';
import type { LedgerEntry } from '../../../../src/application/ports/cost-ledger.js';
import { entryOf, reservationOf } from '../../../support/ledger-fixtures.js';

// RF-426, data-model.md section 3.12: the cost report of a run lists tokens (input, output, cached),
// calls and cost by role, agent task, provider and model, with totals and the price table version.

const ids = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  runId: '00000000-0000-4000-b000-0000000000b1',
};

function row(overrides: Partial<LedgerEntry>): LedgerEntry {
  return entryOf(reservationOf(ids), overrides);
}

const entries: readonly LedgerEntry[] = [
  row({ role: 'reader', agentTaskId: 'reader-orders', costMicros: 400n }),
  row({ role: 'reader', agentTaskId: 'reader-catalog', costMicros: 300n }),
  row({
    role: 'verifier',
    agentTaskId: 'verifier-1',
    provider: 'local',
    model: 'gemma4:e4b',
    costMicros: 0n,
    inputTokens: 50,
    outputTokens: 5,
    cachedInputTokens: 0,
  }),
];

describe('buildCostReport', () => {
  it('RF-426 totals tokens, calls and cost of the run', () => {
    const report = buildCostReport('20261012-100000-understand', entries);

    expect(report.totals).toEqual({
      inputTokens: 2450,
      outputTokens: 165,
      cachedInputTokens: 2048,
      calls: 3,
      costMicros: 700,
      unpricedCalls: 0,
    });
    expect(report).toMatchObject({
      schemaVersion: 1,
      runId: '20261012-100000-understand',
      currency: 'USD',
      priceTableVersion: '2026-10-11',
    });
  });

  it('RF-426 breaks the cost down by role, agent task, provider and model in a stable order', () => {
    const report = buildCostReport('20261012-100000-understand', entries);

    expect(report.byRole.map((line) => [line.role, line.calls, line.costMicros])).toEqual([
      ['reader', 2, 700],
      ['verifier', 1, 0],
    ]);
    expect(report.byAgentTask.map((line) => line.agentTaskId)).toEqual([
      'reader-catalog',
      'reader-orders',
      'verifier-1',
    ]);
    expect(report.byProvider.map((line) => [line.provider, line.costMicros])).toEqual([
      ['local', 0],
      ['openai', 700],
    ]);
    expect(report.byModel.map((line) => [line.provider, line.model, line.inputTokens])).toEqual([
      ['local', 'gemma4:e4b', 50],
      ['openai', 'gpt-5-nano', 2400],
    ]);
  });
});

describe('buildCostReport versions and empty runs', () => {
  it('RF-428 names every price table version the calls used and counts unpriced calls', () => {
    const report = buildCostReport('r', [
      row({ priceTableVersion: '2026-10-11+project', costKnown: false, costMicros: 0n }),
      row({}),
    ]);

    expect(report.priceTableVersion).toBe('2026-10-11, 2026-10-11+project');
    expect(report.totals.unpricedCalls).toBe(1);
  });

  it('RF-426 a run without calls has an empty report', () => {
    const report = buildCostReport('r', []);

    expect(report.totals.calls).toBe(0);
    expect(report.byRole).toEqual([]);
    expect(report.priceTableVersion).toBe('');
  });
});
