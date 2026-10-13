import { expect, it } from 'vitest';
import type { UserRepository } from '../../src/application/ports/user-repository.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { fixtureNow, minutes, sampleAccount } from '../support/account-fixtures.js';

// Architecture section 7: every UserRepository adapter (PgUserRepository, MemoryUserRepository)
// passes this suite. RF-1102: user names are unique case-insensitively; list queries never select
// the password hash (data-model.md section 4).

/** JSON text of a value, with bigint written as a string. */
function jsonOf(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

function storingTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1102 ${name} stores an account and finds it by id and by user name`, async () => {
    const users = await fresh();
    const account = sampleAccount({ userName: 'teacher', dailyCapMicros: 2_500_000n });

    const inserted = await users.insert(account);

    expect(inserted).toEqual({ ok: true, value: account });
    expect(await users.findById(account.id)).toEqual(account);
    expect(await users.findByUserName('teacher')).toEqual(account);
  });

  it(`RF-1102 ${name} finds a user name case-insensitively`, async () => {
    const users = await fresh();
    const account = sampleAccount({ userName: 'teacher' });
    await users.insert(account);

    expect(await users.findByUserName('TeAcHeR')).toEqual(account);
  });

  it(`RF-1102 ${name} refuses a second account with the same user name`, async () => {
    const users = await fresh();
    await users.insert(sampleAccount({ userName: 'teacher' }));

    const second = await users.insert(sampleAccount({ userName: 'teacher' }));

    expect(second).toEqual({ ok: false, error: ERROR_CODES.userNameTaken });
    expect(await users.list()).toHaveLength(1);
  });

  it(`RF-1102 ${name} answers undefined for an unknown id or user name`, async () => {
    const users = await fresh();

    expect(await users.findById('00000000-0000-4000-8000-00000000ffff')).toBeUndefined();
    expect(await users.findByUserName('nobody')).toBeUndefined();
  });
}

function listingTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1102 ${name} lists every account by user name without the password hash`, async () => {
    const users = await fresh();
    const second = sampleAccount({ userName: 'zed', passwordHash: 'fake$hash-of-zed' });
    const first = sampleAccount({ userName: 'amy', passwordHash: 'fake$hash-of-amy' });
    await users.insert(second);
    await users.insert(first);

    const listed = await users.list();

    expect(listed.map((user) => user.userName)).toEqual(['amy', 'zed']);
    for (const user of listed) expect(Object.keys(user)).not.toContain('passwordHash');
    expect(jsonOf(listed)).not.toContain('fake$hash-of');
    const { passwordHash, ...withoutHash } = first;
    expect(passwordHash).toBe('fake$hash-of-amy');
    expect(listed[0]).toEqual(withoutHash);
  });

  it(`RF-1102 ${name} reports whether any account exists`, async () => {
    const users = await fresh();

    const before = await users.hasUsers();
    await users.insert(sampleAccount());

    expect(before).toBe(false);
    expect(await users.hasUsers()).toBe(true);
  });

  it(`RF-1102 ${name} inserts the first account only into an empty table`, async () => {
    const users = await fresh();
    const first = sampleAccount({ userName: 'admin', role: 'admin' });

    const created = await users.insertIfNoUsers(first);
    const again = await users.insertIfNoUsers(sampleAccount({ userName: 'other' }));

    expect(created).toBe(true);
    expect(again).toBe(false);
    expect(await users.list()).toHaveLength(1);
  });
}

function updatingTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1100 ${name} saves the changed state, hash and counters of an account`, async () => {
    const users = await fresh();
    const account = sampleAccount({ state: 'MustChangePassword' });
    await users.insert(account);
    const changed = {
      ...account,
      displayName: 'Renamed',
      role: 'admin' as const,
      state: 'Active' as const,
      passwordHash: 'fake$changed',
      failedSignIns: 2,
      firstFailedAt: fixtureNow + minutes(1),
      lockedUntil: fixtureNow + minutes(16),
      serverKeysAllowed: false,
      dailyCapMicros: 1n,
      ownDailyCapMicros: 9_000_000_000n,
      updatedAt: fixtureNow + minutes(2),
      lastSignInAt: fixtureNow + minutes(3),
    };

    const saved = await users.update(changed);

    expect(saved).toBe(true);
    expect(await users.findById(account.id)).toEqual(changed);
  });

  it(`RF-1100 ${name} reports an update of an unknown account`, async () => {
    const users = await fresh();

    expect(await users.update(sampleAccount())).toBe(false);
  });
}

function conditionalTests(name: string, fresh: () => Promise<UserRepository>): void {
  it(`RF-1103 ${name} saves an account that is still as it was read`, async () => {
    const users = await fresh();
    const account = sampleAccount({ state: 'MustChangePassword' });
    await users.insert(account);
    const changed = { ...account, state: 'Active' as const, updatedAt: fixtureNow + minutes(1) };

    const saved = await users.updateIfCurrent(changed, account);

    expect(saved).toBe(true);
    expect(await users.findById(account.id)).toEqual(changed);
  });

  it.each([
    ['its state changed', { state: 'Disabled' as const }],
    ['it was updated since', { updatedAt: fixtureNow + minutes(5) }],
    ['its password hash changed', { passwordHash: 'fake$reset' }],
  ])(`RF-1102 ${name} keeps an account whose %s`, async (_case, meanwhile) => {
    const users = await fresh();
    const account = sampleAccount();
    await users.insert(account);
    const other = { ...account, ...meanwhile };
    await users.update(other);

    const saved = await users.updateIfCurrent({ ...account, passwordHash: 'fake$new' }, account);

    expect(saved).toBe(false);
    expect(await users.findById(account.id)).toEqual(other);
  });

  it(`RF-1102 ${name} reports a conditional update of an unknown account`, async () => {
    const users = await fresh();
    const account = sampleAccount();

    expect(await users.updateIfCurrent(account, account)).toBe(false);
  });
}

export function userRepositoryContract(name: string, fresh: () => Promise<UserRepository>): void {
  storingTests(name, fresh);
  listingTests(name, fresh);
  updatingTests(name, fresh);
  conditionalTests(name, fresh);
}
