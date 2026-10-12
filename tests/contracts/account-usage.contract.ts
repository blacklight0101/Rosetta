import { expect, it } from 'vitest';
import type { AccountUsage } from '../../src/application/ports/account-usage.js';
import { FixedClock } from '../support/fixed-clock.js';

// Architecture section 7: every AccountUsage adapter (PgAccountUsage, MemoryAccountUsage) passes
// this suite. RF-1102: the administration page shows each account's number of projects and its
// month-to-date cost, a read-only sum over the cost ledger per currency (data-model.md 3.13).

/** What a suite needs to put rows behind the adapter; each adapter's test provides it. */
export interface AccountUsageFixture {
  readonly usage: AccountUsage;
  /** Stores an account and answers its id. */
  addUser(): Promise<string>;
  addProject(userId: string): Promise<void>;
  addCost(userId: string, row: { at: Date; costMicros: bigint; currency?: string }): Promise<void>;
}

const monthStart = new FixedClock('2026-10-01T00:00:00.000Z').now();

function atMinutes(minutes: number): Date {
  const clock = new FixedClock('2026-10-01T00:00:00.000Z');
  clock.advance(minutes * 60_000);
  return clock.now();
}

export function accountUsageContract(
  name: string,
  fresh: () => Promise<AccountUsageFixture>,
): void {
  it(`RF-1102 ${name} counts each user's projects`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    const bob = await fixture.addUser();
    await fixture.addProject(amy);
    await fixture.addProject(amy);
    await fixture.addProject(bob);

    const usage = await fixture.usage.byUser(monthStart.getTime());

    expect(usage.get(amy)).toEqual({ projects: 2, spent: [] });
    expect(usage.get(bob)).toEqual({ projects: 1, spent: [] });
  });

  it(`RF-1102 ${name} sums the ledger from the instant on, per currency`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    await fixture.addCost(amy, { at: atMinutes(-1), costMicros: 900n });
    await fixture.addCost(amy, { at: atMinutes(0), costMicros: 1_500n });
    await fixture.addCost(amy, { at: atMinutes(30), costMicros: 9_007_199_254_740_993n });
    await fixture.addCost(amy, { at: atMinutes(40), costMicros: 7n, currency: 'EUR' });

    const usage = await fixture.usage.byUser(monthStart.getTime());

    expect(usage.get(amy)).toEqual({
      projects: 0,
      spent: [
        { currency: 'EUR', costMicros: 7n },
        { currency: 'USD', costMicros: 9_007_199_254_742_493n },
      ],
    });
  });

  it(`RF-1102 ${name} leaves out users with neither projects nor spend`, async () => {
    const fixture = await fresh();
    const idle = await fixture.addUser();
    await fixture.addCost(idle, { at: atMinutes(-60), costMicros: 10n });

    const usage = await fixture.usage.byUser(monthStart.getTime());

    expect(usage.has(idle)).toBe(false);
  });
}
