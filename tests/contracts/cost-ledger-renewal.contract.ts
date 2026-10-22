import { expect, it } from 'vitest';
import type { CostLedger } from '../../src/application/ports/cost-ledger.js';
import type { UsageCap } from '../../src/domain/budget/usage-cap.js';
import { breachOf, entryOf, reservationOf, reserveAt, worst } from '../support/ledger-fixtures.js';

// RF-422, ADR-007, P3-99: every CostLedger renews the expiry of a call's live reservation, so a
// call that runs longer than its first expiry (a streamed answer that keeps arriving) keeps
// counting against the caps until it settles or is released. A renewal never brings back a
// reservation that was settled or released, and never touches another user's call.

/** What the suite needs behind the adapter; each adapter's test provides it. */
interface RenewalLedgerFixture {
  readonly ledger: CostLedger;
  addUser(): Promise<string>;
  newRunId(): string;
}

type Fresh = () => Promise<RenewalLedgerFixture>;

async function setUp(fresh: Fresh) {
  const fixture = await fresh();
  const ids = { userId: await fixture.addUser(), runId: fixture.newRunId() };
  return { fixture, ledger: fixture.ledger, ids };
}

const runCap = (limit: bigint): UsageCap[] => [{ kind: 'run-cost', limit }];
/** After the fixtures' first expiry (10:05) and before the renewed one. */
const afterFirstExpiry = new Date('2026-10-12T10:07:00.000Z');
const renewedExpiry = new Date('2026-10-12T10:10:00.000Z');

function renewContract(name: string, fresh: Fresh): void {
  it(`RF-422 ${name} keeps counting a renewed reservation after its first expiry`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids, worst(900n));
    await reserveAt(ledger, first, runCap(1_000n));

    await ledger.renew(first, renewedExpiry);
    const next = await reserveAt(
      ledger,
      reservationOf(ids, { ...worst(200n), expiresAt: renewedExpiry }),
      runCap(1_000n),
      afterFirstExpiry,
    );

    expect(breachOf(next)).toEqual({ kind: 'run-cost', limit: 1_000n, spent: 900n, needed: 200n });
    expect(await ledger.purgeExpired(afterFirstExpiry)).toBe(0);
  });
}

function goneContract(name: string, fresh: Fresh): void {
  it(`RF-422 ${name} brings back no reservation of a call that already settled`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids, worst(900n));
    await reserveAt(ledger, first, runCap(1_000n));
    await ledger.settle(entryOf(first, { costMicros: 30n }));

    await ledger.renew(first, renewedExpiry);
    const next = await reserveAt(ledger, reservationOf(ids, worst(970n)), runCap(1_000n));

    expect(next.ok).toBe(true);
  });

  it(`RF-422 ${name} brings back no reservation of a call that was released`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids, worst(900n));
    await reserveAt(ledger, first, runCap(1_000n));
    await ledger.release(first);

    await ledger.renew(first, renewedExpiry);
    const next = await reserveAt(ledger, reservationOf(ids, worst(1_000n)), runCap(1_000n));

    expect(next.ok).toBe(true);
  });
}

function ownerContract(name: string, fresh: Fresh): void {
  it(`RF-1106 ${name} renews only the reservation of the same user's call`, async () => {
    const { fixture, ledger, ids } = await setUp(fresh);
    const mine = reservationOf(ids, worst(900n));
    const theirs = { ...mine, userId: await fixture.addUser() };
    await reserveAt(ledger, mine, runCap(1_000n));

    await ledger.renew(theirs, renewedExpiry);
    const next = await reserveAt(
      ledger,
      reservationOf(ids, { ...worst(900n), expiresAt: renewedExpiry }),
      runCap(1_000n),
      afterFirstExpiry,
    );

    expect(next.ok).toBe(true);
  });
}

export function costLedgerRenewalContract(name: string, fresh: Fresh): void {
  renewContract(name, fresh);
  goneContract(name, fresh);
  ownerContract(name, fresh);
}
