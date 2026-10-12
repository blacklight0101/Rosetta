import { expect, it } from 'vitest';
import type { CostLedger } from '../../src/application/ports/cost-ledger.js';
import type { UsageCap } from '../../src/domain/budget/usage-cap.js';
import {
  breachOf,
  entryOf,
  ledgerNow,
  reservationOf,
  reserveAt,
  spendAt,
  worst,
} from '../support/ledger-fixtures.js';

// Architecture section 7, RF-428, RF-1106, DEC-107, DEC-112: every CostLedger (PgCostLedger,
// MemoryCostLedger) passes this suite. A call reserves its worst case against the caps that apply
// to it; the reservation counts until the call settles into one ledger row or is released; the day
// and month caps sum UTC calendar periods; an expired reservation no longer counts.

/** What the suite needs behind the adapter; each adapter's test provides it. */
interface CostLedgerFixture {
  readonly ledger: CostLedger;
  /** Stores an account and answers its id (the ledger refers to users). */
  addUser(): Promise<string>;
  /** A fresh run id. */
  newRunId(): string;
}

type Fresh = () => Promise<CostLedgerFixture>;

const runCap = (limit: bigint): UsageCap[] => [{ kind: 'run-cost', limit }];

async function setUp(fresh: Fresh) {
  const fixture = await fresh();
  const ids = { userId: await fixture.addUser(), runId: fixture.newRunId() };
  return { fixture, ledger: fixture.ledger, ids };
}

function reserveContract(name: string, fresh: Fresh): void {
  it(`RF-422 ${name} reserves calls inside the run cap and refuses the one that would pass it`, async () => {
    const { ledger, ids } = await setUp(fresh);

    expect((await reserveAt(ledger, reservationOf(ids), runCap(250n))).ok).toBe(true);
    expect((await reserveAt(ledger, reservationOf(ids), runCap(250n))).ok).toBe(true);
    const third = await reserveAt(ledger, reservationOf(ids), runCap(250n));

    expect(breachOf(third)).toEqual({ kind: 'run-cost', limit: 250n, spent: 200n, needed: 100n });
  });

  it(`RF-428 ${name} replaces a reservation by its ledger row when the call settles`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids);
    await reserveAt(ledger, first, runCap(1_000n));

    await ledger.settle(entryOf(first, { costMicros: 30n }));
    const next = await reserveAt(ledger, reservationOf(ids, worst(971n)), runCap(1_000n));

    expect(breachOf(next)).toEqual({ kind: 'run-cost', limit: 1_000n, spent: 30n, needed: 971n });
    expect(await ledger.runEntries(ids.userId, ids.runId)).toEqual([
      entryOf(first, { costMicros: 30n }),
    ]);
  });
}

function releaseContract(name: string, fresh: Fresh): void {
  it(`RF-422 ${name} frees the worst case of a released call`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids, worst(900n));
    await reserveAt(ledger, first, runCap(1_000n));

    await ledger.release(first);

    const next = await reserveAt(ledger, reservationOf(ids, worst(900n)), runCap(1_000n));
    expect(next.ok).toBe(true);
    expect(await ledger.runEntries(ids.userId, ids.runId)).toEqual([]);
  });

  it(`RF-422 ${name} ignores a reservation that has expired, and purges it`, async () => {
    const { ledger, ids } = await setUp(fresh);
    await reserveAt(ledger, reservationOf(ids, worst(900n)), runCap(1_000n));
    const after = new Date('2026-10-12T10:05:00.001Z');
    const expiresAt = new Date('2026-10-12T11:00:00.000Z');

    const next = await reserveAt(
      ledger,
      reservationOf(ids, { ...worst(900n), expiresAt }),
      runCap(1_000n),
      after,
    );

    expect(next.ok).toBe(true);
    expect(await ledger.purgeExpired(after)).toBe(1);
  });
}

function tokenContract(name: string, fresh: Fresh): void {
  it(`RF-422 ${name} counts input and output tokens against the run token cap`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'run-tokens', limit: 2_000n }];
    const first = reservationOf(ids);
    await reserveAt(ledger, first, caps);
    await ledger.settle(entryOf(first));

    const refused = await reserveAt(ledger, reservationOf(ids, worst(0n, 721n)), caps);

    expect(breachOf(refused)).toEqual({
      kind: 'run-tokens',
      limit: 2_000n,
      spent: 1_280n,
      needed: 721n,
    });
  });
}

function dayContract(name: string, fresh: Fresh): void {
  it(`RF-1106 ${name} sums the user day cap over server keys in the UTC day only`, async () => {
    const { fixture, ledger, ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'user-day', limit: 1_000n }];
    const yesterday = new Date('2026-10-11T23:59:59.999Z');
    await spendAt(ledger, ids, yesterday, { keySource: 'server', costMicros: 800n });
    const midnight = new Date('2026-10-12T00:00:00.000Z');
    await spendAt(ledger, ids, midnight, { keySource: 'server', costMicros: 850n });
    await spendAt(ledger, ids, ledgerNow, { keySource: 'user', costMicros: 500n });

    const call = reservationOf({ ...ids, runId: fixture.newRunId() }, worst(151n));
    const refused = await reserveAt(ledger, call, caps);

    expect(breachOf(refused)).toEqual({
      kind: 'user-day',
      limit: 1_000n,
      spent: 850n,
      needed: 151n,
    });
  });

  it(`RF-1106 ${name} sums the own day cap over the user's own keys only`, async () => {
    const { fixture, ledger, ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'own-day', limit: 599n }];
    await spendAt(ledger, ids, ledgerNow, { keySource: 'user', costMicros: 500n });
    await spendAt(ledger, ids, ledgerNow, { keySource: 'server', costMicros: 900n });

    const own = reservationOf({ ...ids, runId: fixture.newRunId() }, { keySource: 'user' });
    const refused = await reserveAt(ledger, own, caps);

    expect(breachOf(refused)).toEqual({ kind: 'own-day', limit: 599n, spent: 500n, needed: 100n });
  });
}

function monthContract(name: string, fresh: Fresh): void {
  it(`RF-1106 ${name} sums the server month over every user's server keys in the UTC month`, async () => {
    const { fixture, ledger, ids } = await setUp(fresh);
    const other = { userId: await fixture.addUser(), runId: fixture.newRunId() };
    const caps: UsageCap[] = [{ kind: 'server-month', limit: 5_000n }];
    const lastMonth = new Date('2026-09-30T23:59:59.999Z');
    await spendAt(ledger, ids, lastMonth, { keySource: 'server', costMicros: 4_000n });
    const monthStart = new Date('2026-10-01T00:00:00.000Z');
    await spendAt(ledger, ids, monthStart, { keySource: 'server', costMicros: 2_000n });
    await spendAt(ledger, other, ledgerNow, { keySource: 'server', costMicros: 2_500n });
    await spendAt(ledger, other, ledgerNow, { keySource: 'user', costMicros: 9_000n });

    const refused = await reserveAt(ledger, reservationOf(ids, worst(501n)), caps);

    expect(breachOf(refused)).toEqual({
      kind: 'server-month',
      limit: 5_000n,
      spent: 4_500n,
      needed: 501n,
    });
  });
}

function listContract(name: string, fresh: Fresh): void {
  it(`RF-1105 ${name} lists a run's rows only for its owner, in call order`, async () => {
    const { fixture, ledger, ids } = await setUp(fresh);
    const stranger = await fixture.addUser();
    const failed = { usageSource: 'estimated', costKnown: false, attempt: 2 } as const;
    const first = reservationOf(ids);
    const second = reservationOf(ids);
    for (const reservation of [first, second]) {
      await reserveAt(ledger, reservation, []);
      await ledger.settle(entryOf(reservation, failed));
    }

    const listed = await ledger.runEntries(ids.userId, ids.runId);

    expect(listed.map((entry) => entry.callId)).toEqual([first.callId, second.callId]);
    expect(listed[1]).toEqual(entryOf(second, failed));
    expect(await ledger.runEntries(stranger, ids.runId)).toEqual([]);
  });
}

function providerTestContract(name: string, fresh: Fresh): void {
  const testRow = {
    runId: null,
    projectId: null,
    agentTaskId: null,
    stage: 'provider-test',
  } as const;

  it(`RF-407 ${name} meters a provider test that belongs to no run against the user's day`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'user-day', limit: 1_000n }];
    const test = reservationOf(ids, { runId: null, ...worst(300n) });
    expect((await reserveAt(ledger, test, caps)).ok).toBe(true);

    await ledger.settle(entryOf(test, { ...testRow, costMicros: 250n }));
    const next = await reserveAt(ledger, reservationOf(ids, worst(751n)), caps);

    expect(breachOf(next)).toEqual({ kind: 'user-day', limit: 1_000n, spent: 250n, needed: 751n });
  });

  it(`RF-407 ${name} counts the reservation of a provider test until it is released`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const caps: UsageCap[] = [{ kind: 'user-day', limit: 1_000n }];
    const test = reservationOf(ids, { runId: null, ...worst(900n) });
    await reserveAt(ledger, test, caps);
    const refused = await reserveAt(ledger, reservationOf(ids, worst(200n)), caps);
    expect(breachOf(refused)).toEqual({
      kind: 'user-day',
      limit: 1_000n,
      spent: 900n,
      needed: 200n,
    });

    await ledger.release(test);

    expect((await reserveAt(ledger, reservationOf(ids, worst(200n)), caps)).ok).toBe(true);
  });
}

function providerTestRunsContract(name: string, fresh: Fresh): void {
  it(`RF-407 ${name} keeps the calls of provider tests out of every run's cap`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids, { runId: null, ...worst(300n) });
    const second = reservationOf(ids, { runId: null, ...worst(300n) });

    await reserveAt(ledger, first, []);
    const unrelated = await reserveAt(ledger, second, runCap(400n));
    const ofRun = await reserveAt(ledger, reservationOf(ids, worst(350n)), runCap(400n));

    expect(unrelated.ok).toBe(true);
    expect(ofRun.ok).toBe(true);
  });
}

function sharedCallIdContract(name: string, fresh: Fresh): void {
  // Call ids are `<runKey>#<n>`, unique only within a project: two users' calls can share one.
  async function twoUsersOneCallId() {
    const { fixture, ledger, ids } = await setUp(fresh);
    const other = { userId: await fixture.addUser(), runId: fixture.newRunId() };
    const mine = reservationOf(ids, worst(900n));
    const theirs = { ...reservationOf(other, worst(900n)), callId: mine.callId };
    return { ledger, ids, mine, theirs };
  }

  it(`RF-1106 ${name} keeps the reservation of a call when another user's call with the same id settles`, async () => {
    const { ledger, ids, mine, theirs } = await twoUsersOneCallId();
    expect((await reserveAt(ledger, mine, runCap(1_000n))).ok).toBe(true);
    expect((await reserveAt(ledger, theirs, runCap(1_000n))).ok).toBe(true);

    await ledger.settle(entryOf(theirs, { costMicros: 30n }));
    const next = await reserveAt(ledger, reservationOf(ids, worst(200n)), runCap(1_000n));

    expect(breachOf(next)).toEqual({ kind: 'run-cost', limit: 1_000n, spent: 900n, needed: 200n });
  });

  it(`RF-1106 ${name} keeps the reservation of a call when another user's call with the same id is released`, async () => {
    const { ledger, ids, mine, theirs } = await twoUsersOneCallId();
    await reserveAt(ledger, mine, runCap(1_000n));
    await reserveAt(ledger, theirs, runCap(1_000n));

    await ledger.release(theirs);
    const next = await reserveAt(ledger, reservationOf(ids, worst(200n)), runCap(1_000n));

    expect(breachOf(next)).toEqual({ kind: 'run-cost', limit: 1_000n, spent: 900n, needed: 200n });
  });

  it(`RF-407 ${name} keeps a provider test's reservation when another user's test with the same call id is released`, async () => {
    const { ledger, ids, mine, theirs } = await twoUsersOneCallId();
    const caps: UsageCap[] = [{ kind: 'user-day', limit: 1_000n }];
    await reserveAt(ledger, { ...mine, runId: null }, caps);
    await reserveAt(ledger, { ...theirs, runId: null }, caps);

    await ledger.release({ ...theirs, runId: null });
    const next = await reserveAt(ledger, reservationOf(ids, { runId: null, ...worst(200n) }), caps);

    expect(breachOf(next)).toEqual({ kind: 'user-day', limit: 1_000n, spent: 900n, needed: 200n });
  });
}

export function costLedgerContract(name: string, fresh: Fresh): void {
  reserveContract(name, fresh);
  releaseContract(name, fresh);
  tokenContract(name, fresh);
  dayContract(name, fresh);
  monthContract(name, fresh);
  listContract(name, fresh);
  providerTestContract(name, fresh);
  providerTestRunsContract(name, fresh);
  sharedCallIdContract(name, fresh);
}
