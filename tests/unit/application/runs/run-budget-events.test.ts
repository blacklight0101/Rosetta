import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../../../../src/application/ports/cost-ledger.js';
import type { LedgerGroup } from '../../../../src/application/ports/cost-totals.js';
import {
  RunBudgetEvents,
  type BudgetEventEmitter,
  type SpendTotals,
} from '../../../../src/application/runs/run-budget-events.js';
import type { UsageCap } from '../../../../src/domain/budget/usage-cap.js';

// RF-421, RF-422, RF-1003, RF-1010, ADR-007, P1-96: what the budget guard of a run reports to the
// run's events: `usage.recorded` after each recorded call, `budget.warning` once at 50, 80 and 95
// percent of the run's caps and `budget.capReached` when a cap stops the run. Generated test data.

interface Emitted {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly agentTaskId: string | undefined;
}

function emitter(): BudgetEventEmitter & { readonly emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  return {
    emitted,
    emit: (type, data, agentTaskId) => {
      emitted.push({ type, data, agentTaskId });
      return Promise.resolve(undefined);
    },
  };
}

const zero: SpendTotals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };

function entry(change: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: new Date('2026-10-12T10:00:00.000Z'),
    userId: 'user-1',
    projectId: 'project-1',
    runId: 'run-1',
    agentTaskId: 'reader-001',
    stage: 'understand',
    role: 'reader',
    provider: 'cloud',
    model: 'model-a',
    callId: '20261012-100000-understand#1',
    attempt: 1,
    keySource: 'server',
    inputTokens: 100,
    outputTokens: 20,
    cachedInputTokens: 10,
    usageSource: 'reported',
    costMicros: 1_500n,
    costKnown: true,
    currency: 'USD',
    priceTableVersion: '2026-10-11',
    ...change,
  };
}

const caps: readonly UsageCap[] = [
  { kind: 'run-cost', limit: 10_000n },
  { kind: 'run-tokens', limit: 1_000_000n },
];

const warnings = (emitted: readonly Emitted[]): unknown[] =>
  emitted.filter((each) => each.type === 'budget.warning').map((each) => each.data);

describe('RunBudgetEvents usage', () => {
  it('RF-1003 RF-1010 publishes usage.recorded with the call, its cost and the run and project totals', async () => {
    const events = emitter();
    const project = { ...zero, inputTokens: 1_000, costMicros: 7_000n };
    const reporter = new RunBudgetEvents({ events, run: zero, project });

    await reporter.callRecorded({ entry: entry(), caps });
    await reporter.callRecorded({ entry: entry({ callId: 'c#2', costMicros: 500n }), caps });

    expect(events.emitted[0]).toEqual({
      type: 'usage.recorded',
      agentTaskId: 'reader-001',
      data: {
        callId: '20261012-100000-understand#1',
        role: 'reader',
        provider: 'cloud',
        model: 'model-a',
        tokens: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10 },
        costMicros: 1_500,
        runTotals: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10, costMicros: 1_500 },
        projectTotals: {
          inputTokens: 1_100,
          outputTokens: 20,
          cachedInputTokens: 10,
          costMicros: 8_500,
        },
      },
    });
    expect(events.emitted[1]?.data).toMatchObject({
      callId: 'c#2',
      costMicros: 500,
      runTotals: { costMicros: 2_000 },
      projectTotals: { costMicros: 9_000 },
    });
  });

  it('RF-1003 a local call that costs nothing reports a cost of zero, not an unknown cost', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.callRecorded({
      entry: entry({ provider: 'local', model: 'qwen', costMicros: 0n }),
      caps,
    });

    expect(events.emitted).toHaveLength(1);
    expect(events.emitted[0]?.data).toMatchObject({ costMicros: 0, runTotals: { costMicros: 0 } });
  });
});

describe('RunBudgetEvents usage fields', () => {
  it('RF-427 a call of an unpriced model reports its tokens but no cost', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.callRecorded({ entry: entry({ costKnown: false, costMicros: 0n }), caps });

    expect(events.emitted[0]?.data).not.toHaveProperty('costMicros');
    expect(events.emitted[0]?.data).toMatchObject({ tokens: { inputTokens: 100 } });
  });

  it('RNF-003 the event carries no prompt, answer or key, only the listed fields', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.callRecorded({ entry: entry(), caps });

    expect(Object.keys(events.emitted[0]?.data ?? {}).sort()).toEqual([
      'callId',
      'costMicros',
      'model',
      'projectTotals',
      'provider',
      'role',
      'runTotals',
      'tokens',
    ]);
  });

  it('RF-1003 a call of no agent task (the provider check) names no agent', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.callRecorded({ entry: entry({ agentTaskId: null }), caps });

    expect(events.emitted[0]?.agentTaskId).toBeUndefined();
  });
});

describe('RunBudgetEvents warnings', () => {
  it('RF-1003 warns once at 50, 80 and 95 percent of the run cost cap', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    for (const micros of [4_000n, 1_000n, 500n, 2_500n, 1_000n, 500n, 100n]) {
      await reporter.callRecorded({ entry: entry({ costMicros: micros }), caps });
    }

    expect(warnings(events.emitted)).toEqual([
      { scope: 'run', sharePercent: 50 },
      { scope: 'run', sharePercent: 80 },
      { scope: 'run', sharePercent: 95 },
    ]);
  });

  it('RF-1003 one call that passes several levels gives one event per level, after its usage', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.callRecorded({ entry: entry({ costMicros: 9_600n }), caps });

    expect(events.emitted.map((each) => each.type)).toEqual([
      'usage.recorded',
      'budget.warning',
      'budget.warning',
      'budget.warning',
    ]);
    expect(warnings(events.emitted)).toEqual([
      { scope: 'run', sharePercent: 50 },
      { scope: 'run', sharePercent: 80 },
      { scope: 'run', sharePercent: 95 },
    ]);
  });
});

describe('RunBudgetEvents warnings on tokens', () => {
  it('RF-1003 counts the run token cap too, and the totals the run had before', async () => {
    const events = emitter();
    const run = { ...zero, inputTokens: 100 };
    const reporter = new RunBudgetEvents({ events, run, project: zero });
    const tokenCaps: readonly UsageCap[] = [{ kind: 'run-tokens', limit: 1_000n }];

    await reporter.callRecorded({
      entry: entry({ inputTokens: 300, outputTokens: 100, costMicros: 0n }),
      caps: tokenCaps,
    });

    expect(warnings(events.emitted)).toEqual([{ scope: 'run', sharePercent: 50 }]);
  });

  it('RF-1003 local calls without a cost never warn against the cost cap', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    for (let call = 0; call < 5; call += 1) {
      await reporter.callRecorded({ entry: entry({ costMicros: 0n }), caps });
    }

    expect(warnings(events.emitted)).toEqual([]);
  });
});

describe('RunBudgetEvents cap', () => {
  it('RF-422 publishes budget.capReached with the cap and what was spent', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.capReached({ kind: 'run-cost', limit: 10_000n, spent: 9_800n, needed: 900n });

    expect(events.emitted).toEqual([
      {
        type: 'budget.capReached',
        agentTaskId: undefined,
        data: { scope: 'run-cost', capMicros: 10_000, spentMicros: 9_800 },
      },
    ]);
  });

  it('RF-422 the token cap reports tokens, not micro-dollars', async () => {
    const events = emitter();
    const reporter = new RunBudgetEvents({ events, run: zero, project: zero });

    await reporter.capReached({ kind: 'run-tokens', limit: 1_000n, spent: 990n, needed: 600n });

    expect(events.emitted[0]?.data).toEqual({
      scope: 'run-tokens',
      capTokens: 1_000,
      spentTokens: 990,
    });
  });
});

describe('RunBudgetEvents.open', () => {
  it('RF-1010 starts from the run ledger rows and the project totals', async () => {
    const events = emitter();
    const group = { costMicros: 3_000n, inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 };
    const reporter = await RunBudgetEvents.open({
      events,
      run: { userId: 'user-1', id: 'run-1', projectId: 'project-1' },
      ledger: { runEntries: () => Promise.resolve([entry({ costMicros: 1_000n })]) },
      costTotals: {
        projectGroups: () => Promise.resolve([projectGroup(group), projectGroup(group)]),
      },
    });

    await reporter.callRecorded({ entry: entry({ costMicros: 500n }), caps });

    expect(events.emitted[0]?.data).toMatchObject({
      runTotals: { costMicros: 1_500, inputTokens: 200 },
      projectTotals: { costMicros: 6_500, inputTokens: 120 },
    });
  });
});

function projectGroup(
  sums: Pick<LedgerGroup, 'costMicros' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens'>,
): LedgerGroup {
  return {
    ...sums,
    currency: 'USD',
    costKnown: true,
    priceTableVersion: '2026-10-11',
    calls: 1,
    runId: 'run-0',
    stage: 'understand',
    role: 'reader',
    provider: 'cloud',
    model: 'model-a',
    keySource: 'server',
    firstAt: new Date('2026-10-11T10:00:00.000Z'),
  };
}
