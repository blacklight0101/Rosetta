import type { LedgerEntry } from '../../src/application/ports/cost-ledger.js';
import type { LedgerGroup } from '../../src/application/ports/cost-totals.js';

// RF-428, RF-1010, P1-36: ledger groups and ledger rows of a fixture ledger, with fixed instants.
// Generated test data only; a test overrides what it needs.

export const costProjectId = '00000000-0000-4000-8000-0000000000c1';
export const costRunA = '00000000-0000-4000-8000-0000000000a1';
export const costRunB = '00000000-0000-4000-8000-0000000000b2';

/** One call of the reader on a paid model with the server key: 1,000 in, 100 out, 50 cached. */
export function groupOf(overrides: Partial<LedgerGroup> = {}): LedgerGroup {
  return {
    runId: costRunA,
    stage: 'understand',
    role: 'reader',
    provider: 'openai',
    model: 'gpt-5-nano',
    keySource: 'server',
    currency: 'USD',
    costKnown: true,
    priceTableVersion: '2026-10-11',
    calls: 1,
    inputTokens: 1000,
    outputTokens: 100,
    cachedInputTokens: 50,
    costMicros: 700n,
    firstAt: new Date('2026-10-12T10:00:00.000Z'),
    ...overrides,
  };
}

let callNumber = 0;

/** A ledger row of the same call as `groupOf`, for the adapters. */
export function costEntry(userId: string, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  callNumber += 1;
  return {
    at: new Date('2026-10-12T10:00:00.000Z'),
    userId,
    projectId: costProjectId,
    runId: costRunA,
    agentTaskId: 'reader-catalog',
    stage: 'understand',
    role: 'reader',
    provider: 'openai',
    model: 'gpt-5-nano',
    callId: `20261012-100000-understand#c${String(callNumber)}`,
    attempt: 1,
    keySource: 'server',
    inputTokens: 1000,
    outputTokens: 100,
    cachedInputTokens: 50,
    usageSource: 'reported',
    cacheWriteInputTokens: 0,
    cacheWriteCostMicros: 0n,
    costMicros: 700n,
    costKnown: true,
    currency: 'USD',
    priceTableVersion: '2026-10-11',
    ...overrides,
  };
}

/** A provider test of the user (RF-407): no project, no run, stage `provider-test`. */
export function providerTestEntry(
  userId: string,
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  return costEntry(userId, {
    projectId: null,
    runId: null,
    agentTaskId: null,
    stage: 'provider-test',
    ...overrides,
  });
}
