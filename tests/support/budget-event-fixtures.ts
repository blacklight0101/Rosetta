import type { LedgerEntry } from '../../src/application/ports/cost-ledger.js';
import type { LedgerGroup } from '../../src/application/ports/cost-totals.js';
import type { BudgetEventEmitter } from '../../src/application/runs/run-budget-events.js';
import { FixedClock } from './fixed-clock.js';

// RF-421, RF-1003, P1-96: ledger rows, ledger groups and an event emitter that keeps what it is
// given, for the tests of a run's budget events. Generated test data only.

export interface Emitted {
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly agentTaskId: string | undefined;
}

/** An emitter that keeps every event it is given, in order. */
export function budgetEventEmitter(): BudgetEventEmitter & { readonly emitted: Emitted[] } {
  const emitted: Emitted[] = [];
  return {
    emitted,
    emit: (type, data, agentTaskId) => {
      emitted.push({ type, data, agentTaskId });
      return Promise.resolve(undefined);
    },
  };
}

/** One answered call of a reader, 1,500 micro-dollars, with the changes given. */
export function ledgerEntryFixture(change: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: new FixedClock('2026-10-12T10:00:00.000Z').now(),
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
    cacheWriteInputTokens: 0,
    cacheWriteCostMicros: 0n,
    costMicros: 1_500n,
    costKnown: true,
    currency: 'USD',
    priceTableVersion: '2026-10-11',
    ...change,
  };
}

type GroupSums = Pick<
  LedgerGroup,
  'costMicros' | 'inputTokens' | 'outputTokens' | 'cachedInputTokens'
>;

/** A ledger group of an earlier run of the project with those sums. */
export function ledgerGroupFixture(sums: GroupSums): LedgerGroup {
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
    firstAt: new FixedClock('2026-10-11T10:00:00.000Z').now(),
  };
}
