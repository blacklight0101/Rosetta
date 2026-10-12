import { expect, it } from 'vitest';
import type {
  CostLedger,
  LedgerEntry,
  Reservation,
} from '../../src/application/ports/cost-ledger.js';
import type { UsageCap } from '../../src/domain/budget/usage-cap.js';
import type { KeySource } from '../../src/domain/budget/price-table.js';

// Architecture section 7, RF-428, RF-1106, DEC-107, DEC-112: every CostLedger (PgCostLedger,
// MemoryCostLedger) passes this suite. A call reserves its worst case against the caps that apply
// to it; the reservation counts until the call settles into one ledger row or is released; the day
// and month caps sum UTC calendar periods; an expired reservation no longer counts.

/** What the suite needs behind the adapter; each adapter's test provides it. */
export interface CostLedgerFixture {
  readonly ledger: CostLedger;
  /** Stores an account and answers its id (the ledger refers to users). */
  addUser(): Promise<string>;
  /** A fresh run id. */
  newRunId(): string;
}

export const ledgerNow = new Date('2026-10-12T10:00:00.000Z');
const later = new Date('2026-10-12T10:05:00.000Z');

let callNumber = 0;

export function reservationOf(
  ids: { readonly userId: string; readonly runId: string },
  overrides: Partial<Reservation> = {},
): Reservation {
  callNumber += 1;
  return {
    callId: `20261012-100000-understand#${String(callNumber)}`,
    userId: ids.userId,
    runId: ids.runId,
    keySource: 'server',
    worstCase: { micros: 100n, tokens: 10n },
    expiresAt: later,
    ...overrides,
  };
}

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
    role: 'reader',
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

const runCap = (limit: bigint): UsageCap => ({ kind: 'run-cost', limit });

interface Setup {
  readonly fixture: CostLedgerFixture;
  readonly userId: string;
  readonly runId: string;
}

async function setUp(fresh: () => Promise<CostLedgerFixture>): Promise<Setup> {
  const fixture = await fresh();
  return { fixture, userId: await fixture.addUser(), runId: fixture.newRunId() };
}

function reserveAt(
  ledger: CostLedger,
  reservation: Reservation,
  caps: readonly UsageCap[],
  at = ledgerNow,
) {
  return ledger.reserve({ reservation, caps, at });
}

function capContract(name: string, fresh: () => Promise<CostLedgerFixture>): void {
  it(`RF-422 ${name} reserves a call inside the run cap and refuses the one that would pass it`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const caps = [runCap(250n)];

    expect((await reserveAt(fixture.ledger, reservationOf(ids), caps)).ok).toBe(true);
    expect((await reserveAt(fixture.ledger, reservationOf(ids), caps)).ok).toBe(true);
    const third = await reserveAt(fixture.ledger, reservationOf(ids), caps);

    expect(third).toEqual({
      ok: false,
      error: { kind: 'run-cost', limit: 250n, spent: 200n, needed: 100n },
    });
  });

  it(`RF-428 ${name} replaces a reservation by its ledger row when the call settles`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const first = reservationOf(ids);
    await reserveAt(fixture.ledger, first, [runCap(1_000n)]);

    await fixture.ledger.settle(entryOf(first, { costMicros: 30n }));
    const next = await reserveAt(
      fixture.ledger,
      reservationOf(ids, { worstCase: { micros: 971n, tokens: 0n } }),
      [runCap(1_000n)],
    );

    expect(next).toEqual({
      ok: false,
      error: { kind: 'run-cost', limit: 1_000n, spent: 30n, needed: 971n },
    });
    expect(await fixture.ledger.runEntries(ids.userId, ids.runId)).toEqual([
      entryOf(first, { costMicros: 30n }),
    ]);
  });

  it(`RF-422 ${name} frees the worst case of a released call`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const first = reservationOf(ids, { worstCase: { micros: 900n, tokens: 0n } });
    await reserveAt(fixture.ledger, first, [runCap(1_000n)]);

    await fixture.ledger.release(first.callId);

    expect(
      (
        await reserveAt(
          fixture.ledger,
          reservationOf(ids, { worstCase: { micros: 900n, tokens: 0n } }),
          [runCap(1_000n)],
        )
      ).ok,
    ).toBe(true);
    expect(await fixture.ledger.runEntries(ids.userId, ids.runId)).toEqual([]);
  });

  it(`RF-422 ${name} counts tokens against the run token cap`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'run-tokens', limit: 2_000n }];
    const first = reservationOf(ids);
    await reserveAt(fixture.ledger, first, caps);
    await fixture.ledger.settle(entryOf(first));

    const refused = await reserveAt(
      fixture.ledger,
      reservationOf(ids, { worstCase: { micros: 0n, tokens: 721n } }),
      caps,
    );

    expect(refused.ok ? undefined : refused.error).toEqual({
      kind: 'run-tokens',
      limit: 2_000n,
      spent: 1_280n,
      needed: 721n,
    });
  });

  it(`RF-422 ${name} ignores a reservation that has expired`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    await reserveAt(
      fixture.ledger,
      reservationOf(ids, { worstCase: { micros: 900n, tokens: 0n } }),
      [runCap(1_000n)],
    );

    const after = new Date('2026-10-12T10:05:00.001Z');
    const next = await reserveAt(
      fixture.ledger,
      reservationOf(ids, {
        worstCase: { micros: 900n, tokens: 0n },
        expiresAt: new Date('2026-10-12T11:00:00.000Z'),
      }),
      [runCap(1_000n)],
      after,
    );

    expect(next.ok).toBe(true);
    expect(await fixture.ledger.purgeExpired(after)).toBe(1);
  });
}

function periodContract(name: string, fresh: () => Promise<CostLedgerFixture>): void {
  async function spendAt(
    fixture: CostLedgerFixture,
    ids: { userId: string; runId: string },
    at: Date,
    spend: { keySource: KeySource; costMicros: bigint },
  ): Promise<void> {
    const reservation = reservationOf(ids, { keySource: spend.keySource });
    await reserveAt(fixture.ledger, reservation, [], at);
    await fixture.ledger.settle(entryOf(reservation, { at, costMicros: spend.costMicros }));
  }

  it(`RF-1106 ${name} sums the user day cap over server keys in the UTC day only`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'user-day', limit: 1_000n }];
    await spendAt(fixture, ids, new Date('2026-10-11T23:59:59.999Z'), {
      keySource: 'server',
      costMicros: 800n,
    });
    await spendAt(fixture, ids, new Date('2026-10-12T00:00:00.000Z'), {
      keySource: 'server',
      costMicros: 850n,
    });
    await spendAt(fixture, ids, ledgerNow, { keySource: 'user', costMicros: 500n });

    const refused = await reserveAt(
      fixture.ledger,
      reservationOf(
        { ...ids, runId: fixture.newRunId() },
        { worstCase: { micros: 151n, tokens: 0n } },
      ),
      caps,
    );

    expect(refused.ok ? undefined : refused.error).toEqual({
      kind: 'user-day',
      limit: 1_000n,
      spent: 850n,
      needed: 151n,
    });
  });

  it(`RF-1106 ${name} sums the own day cap over the user's own keys only`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'own-day', limit: 599n }];
    await spendAt(fixture, ids, ledgerNow, { keySource: 'user', costMicros: 500n });
    await spendAt(fixture, ids, ledgerNow, { keySource: 'server', costMicros: 900n });

    const own = reservationOf({ ...ids, runId: fixture.newRunId() }, { keySource: 'user' });
    const refused = await reserveAt(fixture.ledger, own, caps);

    expect(refused.ok ? undefined : refused.error).toEqual({
      kind: 'own-day',
      limit: 599n,
      spent: 500n,
      needed: 100n,
    });
  });

  it(`RF-1106 ${name} sums the server month over every user's server keys in the UTC month`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const other = { userId: await fixture.addUser(), runId: fixture.newRunId() };
    const caps: UsageCap[] = [{ kind: 'server-month', limit: 5_000n }];
    await spendAt(fixture, ids, new Date('2026-09-30T23:59:59.999Z'), {
      keySource: 'server',
      costMicros: 4_000n,
    });
    await spendAt(fixture, ids, new Date('2026-10-01T00:00:00.000Z'), {
      keySource: 'server',
      costMicros: 2_000n,
    });
    await spendAt(fixture, other, ledgerNow, { keySource: 'server', costMicros: 2_500n });
    await spendAt(fixture, other, ledgerNow, { keySource: 'user', costMicros: 9_000n });

    const refused = await reserveAt(
      fixture.ledger,
      reservationOf(ids, { worstCase: { micros: 501n, tokens: 0n } }),
      caps,
    );

    expect(refused.ok ? undefined : refused.error).toEqual({
      kind: 'server-month',
      limit: 5_000n,
      spent: 4_500n,
      needed: 501n,
    });
  });

  it(`RF-1105 ${name} lists a run's rows only for its owner, in call order`, async () => {
    const { fixture, ...ids } = await setUp(fresh);
    const stranger = await fixture.addUser();
    const first = reservationOf(ids);
    const second = reservationOf(ids);
    for (const reservation of [first, second]) {
      await reserveAt(fixture.ledger, reservation, []);
      await fixture.ledger.settle(
        entryOf(reservation, { usageSource: 'estimated', costKnown: false, attempt: 2 }),
      );
    }

    const listed = await fixture.ledger.runEntries(ids.userId, ids.runId);

    expect(listed.map((entry) => entry.callId)).toEqual([first.callId, second.callId]);
    expect(listed[1]).toEqual(
      entryOf(second, { usageSource: 'estimated', costKnown: false, attempt: 2 }),
    );
    expect(await fixture.ledger.runEntries(stranger, ids.runId)).toEqual([]);
  });
}

export function costLedgerContract(name: string, fresh: () => Promise<CostLedgerFixture>): void {
  capContract(name, fresh);
  periodContract(name, fresh);
}
