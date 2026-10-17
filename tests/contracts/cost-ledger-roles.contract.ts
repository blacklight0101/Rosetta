import { expect, it } from 'vitest';
import type { CostLedger } from '../../src/application/ports/cost-ledger.js';
import type { UsageCap } from '../../src/domain/budget/usage-cap.js';
import { breachOf, entryOf, reservationOf, reserveAt, worst } from '../support/ledger-fixtures.js';

// RF-423, RF-422, ADR-007, data-model.md section 4 (`cost_reservations.role`): every CostLedger
// sums a role's own spend in the run, settled and reserved, against the role caps. Another role's
// calls and another run's calls never count against it.

/** What the suite needs behind the adapter; each adapter's test provides it. */
interface RoleLedgerFixture {
  readonly ledger: CostLedger;
  addUser(): Promise<string>;
  newRunId(): string;
}

type Fresh = () => Promise<RoleLedgerFixture>;

async function setUp(fresh: Fresh) {
  const fixture = await fresh();
  const ids = { userId: await fixture.addUser(), runId: fixture.newRunId() };
  return { fixture, ledger: fixture.ledger, ids };
}

const roleCost = (limit: bigint): UsageCap[] => [{ kind: 'role-cost', limit }];
const roleTokens = (limit: bigint): UsageCap[] => [{ kind: 'role-tokens', limit }];

function spendContract(name: string, fresh: Fresh): void {
  it(`RF-423 ${name} refuses a call of a role whose own spend and reservations would pass its cost cap`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const settled = reservationOf(ids, worst(100n));
    await reserveAt(ledger, settled, []);
    await ledger.settle(entryOf(settled, { costMicros: 60n }));
    await reserveAt(ledger, reservationOf(ids, worst(100n)), []);

    const refused = await reserveAt(ledger, reservationOf(ids, worst(41n)), roleCost(200n));
    const fits = await reserveAt(ledger, reservationOf(ids, worst(40n)), roleCost(200n));

    expect(breachOf(refused)).toEqual({ kind: 'role-cost', limit: 200n, spent: 160n, needed: 41n });
    expect(fits.ok).toBe(true);
  });

  it(`RF-423 ${name} counts the tokens of the role against its token cap`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const first = reservationOf(ids, worst(0n, 300n));
    await reserveAt(ledger, first, []);
    await ledger.settle(entryOf(first, { inputTokens: 100, outputTokens: 50 }));

    const refused = await reserveAt(ledger, reservationOf(ids, worst(0n, 351n)), roleTokens(500n));

    expect(breachOf(refused)).toEqual({
      kind: 'role-tokens',
      limit: 500n,
      spent: 150n,
      needed: 351n,
    });
  });
}

function scopeContract(name: string, fresh: Fresh): void {
  it(`RF-423 ${name} does not count the spend of another role against a role cap`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const verifier = reservationOf(ids, { role: 'verifier', ...worst(900n, 900n) });
    await reserveAt(ledger, verifier, []);
    await ledger.settle(entryOf(verifier, { costMicros: 900n }));
    await reserveAt(ledger, reservationOf(ids, { role: 'verifier', ...worst(900n) }), []);

    const reader = await reserveAt(ledger, reservationOf(ids, worst(150n)), roleCost(200n));
    const sameRole = await reserveAt(
      ledger,
      reservationOf(ids, { role: 'verifier', ...worst(150n) }),
      roleCost(200n),
    );

    expect(reader.ok).toBe(true);
    expect(breachOf(sameRole)?.kind).toBe('role-cost');
  });

  it(`RF-423 ${name} does not count the spend of another run of the same role`, async () => {
    const { fixture, ledger, ids } = await setUp(fresh);
    const other = { userId: ids.userId, runId: fixture.newRunId() };
    const earlier = reservationOf(other, worst(900n));
    await reserveAt(ledger, earlier, []);
    await ledger.settle(entryOf(earlier, { costMicros: 900n }));

    const next = await reserveAt(ledger, reservationOf(ids, worst(150n)), roleCost(200n));

    expect(next.ok).toBe(true);
  });

  it(`RF-423 ${name} frees the reservation of a role call that is released`, async () => {
    const { ledger, ids } = await setUp(fresh);
    const held = reservationOf(ids, worst(180n));
    await reserveAt(ledger, held, []);
    expect((await reserveAt(ledger, reservationOf(ids, worst(100n)), roleCost(200n))).ok).toBe(
      false,
    );

    await ledger.release(held);

    expect((await reserveAt(ledger, reservationOf(ids, worst(100n)), roleCost(200n))).ok).toBe(
      true,
    );
  });
}

// RF-423
export function costLedgerRoleContract(name: string, fresh: Fresh): void {
  spendContract(name, fresh);
  scopeContract(name, fresh);
}
