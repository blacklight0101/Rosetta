import { expect, it } from 'vitest';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { fixtureNow, minutes, sampleAccount } from '../support/account-fixtures.js';

// RF-1100, DEC-112, P1-86: every UserRepository adapter counts a failed sign-in in one write that
// moves only the failure counters: five failures within 15 minutes lock the account for 15
// minutes, a failure after the window starts a new one, a locked or unknown account is left as it
// is, and a concurrent change of the state or the password hash is never undone.

function countingTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1100 ${name} counts a first failure and opens the window`, async () => {
    const users = await fresh();
    const account = sampleAccount();
    await users.insert(account);

    const locked = await users.countFailedSignIn(account.id, fixtureNow);

    expect(locked).toBe(false);
    expect(await users.findById(account.id)).toEqual({
      ...account,
      failedSignIns: 1,
      firstFailedAt: fixtureNow,
    });
  });

  it(`RF-1100 ${name} locks for 15 minutes at the fifth failure in the window`, async () => {
    const users = await fresh();
    const account = sampleAccount({ failedSignIns: 4, firstFailedAt: fixtureNow - minutes(5) });
    await users.insert(account);

    const locked = await users.countFailedSignIn(account.id, fixtureNow);

    expect(locked).toBe(true);
    expect(await users.findById(account.id)).toEqual({
      ...account,
      failedSignIns: 5,
      lockedUntil: fixtureNow + minutes(15),
    });
  });
}

function sequenceTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1100 ${name} reports only the fifth of five failures in a row as the lock`, async () => {
    const users = await fresh();
    const account = sampleAccount();
    await users.insert(account);

    const outcomes: boolean[] = [];
    for (let step = 0; step < 5; step += 1) {
      outcomes.push(await users.countFailedSignIn(account.id, fixtureNow + minutes(step)));
    }

    expect(outcomes).toEqual([false, false, false, false, true]);
    expect(await users.findById(account.id)).toMatchObject({
      failedSignIns: 5,
      firstFailedAt: fixtureNow,
      lockedUntil: fixtureNow + minutes(19),
    });
  });

  it(`RF-1100 ${name} starts a new window for a failure after 15 minutes`, async () => {
    const users = await fresh();
    const account = sampleAccount({ failedSignIns: 4, firstFailedAt: fixtureNow - minutes(15) });
    await users.insert(account);

    const locked = await users.countFailedSignIn(account.id, fixtureNow);

    expect(locked).toBe(false);
    expect(await users.findById(account.id)).toEqual({
      ...account,
      failedSignIns: 1,
      firstFailedAt: fixtureNow,
    });
  });
}

function guardTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1100 ${name} leaves a locked account as it is`, async () => {
    const users = await fresh();
    const account = sampleAccount({
      failedSignIns: 5,
      firstFailedAt: fixtureNow - minutes(2),
      lockedUntil: fixtureNow + minutes(1),
    });
    await users.insert(account);

    expect(await users.countFailedSignIn(account.id, fixtureNow)).toBe(false);
    expect(await users.findById(account.id)).toEqual(account);
  });

  it(`RF-1100 ${name} counts nothing for an unknown account`, async () => {
    const users = await fresh();

    expect(await users.countFailedSignIn('00000000-0000-4000-8000-00000000ffff', fixtureNow)).toBe(
      false,
    );
    expect(await users.list()).toEqual([]);
  });

  it(`RF-1102 ${name} counts a failure without undoing a concurrent disable or reset`, async () => {
    const users = await fresh();
    const account = sampleAccount();
    await users.insert(account);
    const meanwhile = {
      ...account,
      state: 'Disabled' as const,
      passwordHash: 'fake$reset',
      updatedAt: fixtureNow + minutes(1),
    };
    await users.update(meanwhile);

    await users.countFailedSignIn(account.id, fixtureNow + minutes(2));

    expect(await users.findById(account.id)).toEqual({
      ...meanwhile,
      failedSignIns: 1,
      firstFailedAt: fixtureNow + minutes(2),
    });
  });
}

export function failedSignInCounterContract(
  name: string,
  fresh: () => Promise<UserRepository>,
): void {
  countingTests(name, fresh);
  sequenceTests(name, fresh);
  guardTests(name, fresh);
}
