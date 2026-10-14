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
  addCost(
    userId: string,
    row: { at: Date; costMicros: bigint; currency?: string; keySource?: 'user' | 'server' },
  ): Promise<void>;
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
  serverMonthContract(name, fresh);
  userDayContract(name, fresh);
}

function serverMonthContract(name: string, fresh: () => Promise<AccountUsageFixture>): void {
  it(`RF-1106 ${name} totals the month of server-key spend only, per currency, from the instant on`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    const bob = await fixture.addUser();
    await fixture.addCost(amy, { at: atMinutes(5), costMicros: 1_000n, keySource: 'server' });
    await fixture.addCost(bob, { at: atMinutes(6), costMicros: 250n, keySource: 'server' });
    await fixture.addCost(bob, { at: atMinutes(7), costMicros: 90_000n, keySource: 'user' });
    await fixture.addCost(amy, { at: atMinutes(8), costMicros: 7n, currency: 'EUR' });
    await fixture.addCost(amy, { at: atMinutes(-5), costMicros: 500n, keySource: 'server' });

    const total = await fixture.usage.serverMonth(monthStart.getTime());

    expect(total).toEqual([
      { currency: 'EUR', costMicros: 7n },
      { currency: 'USD', costMicros: 1_250n },
    ]);
  });

  it(`RF-1106 ${name} totals nothing for a month without server-key spend`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    await fixture.addCost(amy, { at: atMinutes(5), costMicros: 90_000n, keySource: 'user' });

    expect(await fixture.usage.serverMonth(monthStart.getTime())).toEqual([]);
  });
}

function userDayContract(name: string, fresh: () => Promise<AccountUsageFixture>): void {
  it(`RF-1106 ${name} totals one user's spend from the instant on, split by who paid, per currency`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    const bob = await fixture.addUser();
    await fixture.addCost(amy, { at: atMinutes(5), costMicros: 400n, keySource: 'server' });
    await fixture.addCost(amy, { at: atMinutes(6), costMicros: 100n, keySource: 'server' });
    await fixture.addCost(amy, { at: atMinutes(7), costMicros: 90_000n, keySource: 'user' });
    await fixture.addCost(amy, { at: atMinutes(8), costMicros: 7n, currency: 'EUR' });
    await fixture.addCost(amy, { at: atMinutes(-5), costMicros: 800n, keySource: 'server' });
    await fixture.addCost(bob, { at: atMinutes(9), costMicros: 5_000n, keySource: 'server' });

    const spend = await fixture.usage.userDay(amy, monthStart.getTime());

    expect(spend).toEqual({
      server: [
        { currency: 'EUR', costMicros: 7n },
        { currency: 'USD', costMicros: 500n },
      ],
      own: [{ currency: 'USD', costMicros: 90_000n }],
    });
  });

  it(`RF-1105 ${name} totals nothing for a user without spend since the instant`, async () => {
    const fixture = await fresh();
    const amy = await fixture.addUser();
    await fixture.addCost(amy, { at: atMinutes(-60), costMicros: 10n });

    expect(await fixture.usage.userDay(amy, monthStart.getTime())).toEqual({ server: [], own: [] });
  });
}
