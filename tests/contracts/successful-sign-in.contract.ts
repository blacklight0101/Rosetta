import { expect, it } from 'vitest';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { fixtureNow, minutes, sampleAccount } from '../support/account-fixtures.js';

// RF-1100, RF-1102, P1-133: every UserRepository adapter records a successful sign-in in one write
// of the sign-in columns only (failure counters, lock, last sign-in time). The write is refused
// for a Disabled account or one whose password hash changed since it was read, so a concurrent
// disable or reset is never undone. A lock that ends exactly now no longer locks (`<=`).

type Fresh = () => Promise<UserRepository>;

function writeTests(name: string, fresh: Fresh): void {
  it(`RF-1100 ${name} clears the counters and the lock and records the sign-in time`, async () => {
    const users = await fresh();
    const account = sampleAccount({
      failedSignIns: 5,
      firstFailedAt: fixtureNow - minutes(20),
      lockedUntil: fixtureNow - minutes(5),
    });
    await users.insert(account);

    const stored = await users.markSignedIn(account, fixtureNow);

    expect(stored).toBe(true);
    expect(await users.findById(account.id)).toEqual({
      ...account,
      failedSignIns: 0,
      firstFailedAt: null,
      lockedUntil: null,
      lastSignInAt: fixtureNow,
    });
  });
}

function raceTests(name: string, fresh: Fresh): void {
  it(`RF-1102 ${name} refuses the sign-in of an account disabled since it was read`, async () => {
    const users = await fresh();
    const account = sampleAccount({ failedSignIns: 2, firstFailedAt: fixtureNow });
    await users.insert(account);
    const disabled = { ...account, state: 'Disabled' as const, updatedAt: fixtureNow + 1 };
    await users.update(disabled);

    const stored = await users.markSignedIn(account, fixtureNow + minutes(1));

    expect(stored).toBe(false);
    expect(await users.findById(account.id)).toEqual(disabled);
  });

  it(`RF-1102 ${name} refuses the sign-in of an account whose password was reset`, async () => {
    const users = await fresh();
    const account = sampleAccount();
    await users.insert(account);
    const reset = {
      ...account,
      state: 'MustChangePassword' as const,
      passwordHash: 'fake$reset',
      updatedAt: fixtureNow + 1,
    };
    await users.update(reset);

    const stored = await users.markSignedIn(account, fixtureNow + minutes(1));

    expect(stored).toBe(false);
    expect(await users.findById(account.id)).toEqual(reset);
  });
}

function keepTests(name: string, fresh: Fresh): void {
  it(`RF-1102 ${name} keeps a role or cap change made since the account was read`, async () => {
    const users = await fresh();
    const account = sampleAccount({ failedSignIns: 1, firstFailedAt: fixtureNow });
    await users.insert(account);
    const promoted = { ...account, role: 'admin' as const, dailyCapMicros: 7n, updatedAt: 9 };
    await users.update(promoted);

    expect(await users.markSignedIn(account, fixtureNow + minutes(1))).toBe(true);
    expect(await users.findById(account.id)).toEqual({
      ...promoted,
      failedSignIns: 0,
      firstFailedAt: null,
      lastSignInAt: fixtureNow + minutes(1),
    });
  });

  it(`RF-1100 ${name} reports false for an unknown account`, async () => {
    const users = await fresh();

    const stored = await users.markSignedIn(sampleAccount(), fixtureNow);

    expect(stored).toBe(false);
    expect(await users.list()).toEqual([]);
  });

  it(`RF-1100 ${name} counts a failure when the lock ends exactly now`, async () => {
    const users = await fresh();
    const account = sampleAccount({
      failedSignIns: 5,
      firstFailedAt: fixtureNow - minutes(15) + 1,
      lockedUntil: fixtureNow,
    });
    await users.insert(account);

    await users.countFailedSignIn(account.id, fixtureNow);

    expect(await users.findById(account.id)).toMatchObject({ failedSignIns: 6 });
  });
}

export function successfulSignInContract(name: string, fresh: Fresh): void {
  writeTests(name, fresh);
  raceTests(name, fresh);
  keepTests(name, fresh);
}
