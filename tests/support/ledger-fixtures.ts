import type {
  CostLedger,
  LedgerEntry,
  Reservation,
} from '../../src/application/ports/cost-ledger.js';
import type { KeySource } from '../../src/domain/budget/price-table.js';
import type { CapBreach, UsageCap } from '../../src/domain/budget/usage-cap.js';
import type { Result } from '../../src/domain/errors/result.js';

// RF-428, RF-1106: reservations and ledger rows of tests, with fixed instants. Generated test data
// only; a test overrides what it needs.

export const ledgerNow = new Date('2026-10-12T10:00:00.000Z');
const later = new Date('2026-10-12T10:05:00.000Z');

let callNumber = 0;

interface RunIds {
  readonly userId: string;
  readonly runId: string;
}

/** A reservation of a fresh call of the run, with a worst case of 100 micro-dollars and 10 tokens. */
export function reservationOf(ids: RunIds, overrides: Partial<Reservation> = {}): Reservation {
  callNumber += 1;
  return {
    callId: `20261012-100000-understand#${String(callNumber)}`,
    userId: ids.userId,
    runId: ids.runId,
    role: 'reader',
    keySource: 'server',
    worstCase: { micros: 100n, tokens: 10n },
    expiresAt: later,
    ...overrides,
  };
}

/** The ledger row of a reserved call: 1,200 input, 80 output and 1,024 cached tokens, 40 micros. */
export function entryOf(
  reservation: Reservation,
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    at: ledgerNow,
    userId: reservation.userId,
    projectId: '00000000-0000-4000-8000-0000000000aa',
    runId: reservation.runId,
    agentTaskId: 'reader-catalog',
    stage: 'understand',
    role: reservation.role,
    provider: 'openai',
    model: 'gpt-5-nano',
    callId: reservation.callId,
    attempt: 1,
    keySource: reservation.keySource,
    inputTokens: 1200,
    outputTokens: 80,
    cachedInputTokens: 1024,
    usageSource: 'reported',
    costMicros: 40n,
    costKnown: true,
    currency: 'USD',
    priceTableVersion: '2026-10-11',
    ...overrides,
  };
}

/** A worst case of `micros` micro-dollars and `tokens` tokens. */
export const worst = (micros: bigint, tokens = 0n): Pick<Reservation, 'worstCase'> => ({
  worstCase: { micros, tokens },
});

export function reserveAt(
  ledger: CostLedger,
  reservation: Reservation,
  caps: readonly UsageCap[],
  at = ledgerNow,
): Promise<Result<void, CapBreach>> {
  return ledger.reserve({ reservation, caps, at });
}

/** The cap a refused reservation names; undefined when it was reserved. */
export function breachOf(result: Result<void, CapBreach>): CapBreach | undefined {
  return result.ok ? undefined : result.error;
}

/** A call of the run that cost `costMicros` at `at`, reserved and settled. */
export async function spendAt(
  ledger: CostLedger,
  ids: RunIds,
  at: Date,
  spend: { readonly keySource: KeySource; readonly costMicros: bigint },
): Promise<void> {
  const reservation = reservationOf(ids, { keySource: spend.keySource });
  await reserveAt(ledger, reservation, [], at);
  await ledger.settle(entryOf(reservation, { at, costMicros: spend.costMicros }));
}
