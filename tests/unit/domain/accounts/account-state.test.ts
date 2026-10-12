import { describe, expect, it } from 'vitest';
import {
  changePassword,
  disableAccount,
  enableAccount,
  resetPassword,
} from '../../../../src/domain/accounts/account-transitions.js';
import {
  isLocked,
  recordFailedSignIn,
  recordSuccessfulSignIn,
} from '../../../../src/domain/accounts/sign-in-failures.js';
import { accountState, createAccount } from '../../../../src/domain/accounts/user.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { UserAccount } from '../../../../src/domain/accounts/user.js';
import { fixtureNow, minutes, sampleAccount } from '../../../support/account-fixtures.js';

// Architecture section 5, AccountState: MustChangePassword -> Active on change; Active -> Locked
// after 5 failures within 15 minutes, back after 15 minutes; any -> Disabled by an administrator
// (RF-1100, RF-1102, RF-1103); the failure window starts at first_failed_at (DEC-112).

function failTimes(account: UserAccount, times: number, stepMs = 0): UserAccount {
  let current = account;
  for (let index = 0; index < times; index += 1) {
    current = recordFailedSignIn(current, fixtureNow + index * stepMs).account;
  }
  return current;
}

describe('createAccount', () => {
  it('RF-1102 creates an account that must change its password, with clear counters', () => {
    const created = createAccount({
      id: '00000000-0000-4000-8000-000000000001',
      userName: 'Admin',
      displayName: 'Administrator',
      role: 'admin',
      passwordHash: 'fake$hash',
      mustChangePassword: true,
      now: fixtureNow,
    });

    expect(created).toEqual({
      ok: true,
      value: {
        id: '00000000-0000-4000-8000-000000000001',
        userName: 'admin',
        displayName: 'Administrator',
        role: 'admin',
        state: 'MustChangePassword',
        passwordHash: 'fake$hash',
        failedSignIns: 0,
        firstFailedAt: null,
        lockedUntil: null,
        serverKeysAllowed: true,
        dailyCapMicros: null,
        ownDailyCapMicros: null,
        createdAt: fixtureNow,
        updatedAt: fixtureNow,
        lastSignInAt: null,
      },
    });
  });

  it('RF-1107 creates an Active account when no change is required', () => {
    const created = createAccount({
      id: '00000000-0000-4000-8000-000000000002',
      userName: 'teacher',
      displayName: 'Teacher',
      role: 'user',
      passwordHash: 'fake$hash',
      mustChangePassword: false,
      now: fixtureNow,
    });

    expect(created.ok && created.value.state).toBe('Active');
  });

  it.each([
    ['userName', 'no', ERROR_CODES.userNameInvalid],
    ['displayName', '', ERROR_CODES.displayNameInvalid],
  ] as const)('RF-1102 refuses an invalid %s', (field, value, code) => {
    const created = createAccount({
      id: '00000000-0000-4000-8000-000000000003',
      userName: 'teacher',
      displayName: 'Teacher',
      role: 'user',
      passwordHash: 'fake$hash',
      mustChangePassword: true,
      now: fixtureNow,
      [field]: value,
    });

    expect(created).toEqual({ ok: false, error: code });
  });
});

describe('account state transitions', () => {
  it('RF-1103 MustChangePassword becomes Active when the password is changed', () => {
    const account = sampleAccount({ state: 'MustChangePassword' });

    const changed = changePassword(account, 'fake$new', fixtureNow + 1);

    expect(changed).toEqual({
      ok: true,
      value: { ...account, state: 'Active', passwordHash: 'fake$new', updatedAt: fixtureNow + 1 },
    });
  });

  it('RF-1102 a Disabled account cannot change its password', () => {
    const account = sampleAccount({ state: 'Disabled' });

    expect(changePassword(account, 'fake$new', fixtureNow)).toEqual({
      ok: false,
      error: ERROR_CODES.accountStateInvalid,
    });
  });

  it.each(['Active', 'MustChangePassword', 'Disabled'] as const)(
    'RF-1102 an administrator can disable an account that is %s',
    (state) => {
      const disabled = disableAccount(sampleAccount({ state }), fixtureNow + 5);

      expect(disabled.state).toBe('Disabled');
      expect(disabled.updatedAt).toBe(fixtureNow + 5);
      expect(accountState(disabled, fixtureNow + 5)).toBe('Disabled');
    },
  );

  it('RF-1102 enabling a Disabled account makes it Active with clear failure counters', () => {
    const account = sampleAccount({
      state: 'Disabled',
      failedSignIns: 3,
      firstFailedAt: fixtureNow,
      lockedUntil: fixtureNow + minutes(15),
    });

    const enabled = enableAccount(account, fixtureNow + 1);

    expect(enabled).toEqual({
      ok: true,
      value: {
        ...account,
        state: 'Active',
        failedSignIns: 0,
        firstFailedAt: null,
        lockedUntil: null,
        updatedAt: fixtureNow + 1,
      },
    });
  });

  it('RF-1102 enabling an account that is not Disabled is refused', () => {
    expect(enableAccount(sampleAccount(), fixtureNow)).toEqual({
      ok: false,
      error: ERROR_CODES.accountStateInvalid,
    });
  });

  it('RF-1102 resetting a password sets MustChangePassword and the new hash', () => {
    const reset = resetPassword(sampleAccount(), 'fake$reset', fixtureNow);

    expect(reset.ok && reset.value.state).toBe('MustChangePassword');
    expect(reset.ok && reset.value.passwordHash).toBe('fake$reset');
  });

  it('RF-1102 resetting the password of a Disabled account is refused', () => {
    expect(resetPassword(sampleAccount({ state: 'Disabled' }), 'fake$x', fixtureNow)).toEqual({
      ok: false,
      error: ERROR_CODES.accountStateInvalid,
    });
  });
});

describe('sign-in failures and the lock', () => {
  it('RF-1100 four failures within 15 minutes leave the account Active', () => {
    const account = failTimes(sampleAccount(), 4, minutes(1));

    expect(account.failedSignIns).toBe(4);
    expect(account.firstFailedAt).toBe(fixtureNow);
    expect(accountState(account, fixtureNow + minutes(4))).toBe('Active');
  });

  it('RF-1100 the fifth failure within 15 minutes locks the account for 15 minutes', () => {
    const fourFailures = failTimes(sampleAccount(), 4, minutes(1));

    const fifth = recordFailedSignIn(fourFailures, fixtureNow + minutes(14));

    expect(fifth.locked).toBe(true);
    expect(fifth.account.lockedUntil).toBe(fixtureNow + minutes(29));
    expect(accountState(fifth.account, fixtureNow + minutes(14))).toBe('Locked');
    expect(isLocked(fifth.account, fixtureNow + minutes(29) - 1)).toBe(true);
  });

  it('RF-1100 a locked account is back after 15 minutes', () => {
    const locked = failTimes(sampleAccount(), 5);

    expect(isLocked(locked, fixtureNow + minutes(15))).toBe(false);
    expect(accountState(locked, fixtureNow + minutes(15))).toBe('Active');
  });

  it('RF-1100 DEC-112 a failure after the 15-minute window starts a new window', () => {
    const fourFailures = failTimes(sampleAccount(), 4, minutes(1));

    const late = recordFailedSignIn(fourFailures, fixtureNow + minutes(15));

    expect(late.locked).toBe(false);
    expect(late.account.failedSignIns).toBe(1);
    expect(late.account.firstFailedAt).toBe(fixtureNow + minutes(15));
  });

  it('RF-1100 a failure while the account is locked changes nothing', () => {
    const locked = failTimes(sampleAccount(), 5);

    const again = recordFailedSignIn(locked, fixtureNow + minutes(1));

    expect(again).toEqual({ account: locked, locked: false });
  });

  it('RF-1100 a successful sign-in clears the counters and records the time', () => {
    const failed = failTimes(sampleAccount(), 3);

    const signedIn = recordSuccessfulSignIn(failed, fixtureNow + 7);

    expect(signedIn).toEqual({
      ...failed,
      failedSignIns: 0,
      firstFailedAt: null,
      lockedUntil: null,
      lastSignInAt: fixtureNow + 7,
    });
  });

  it('RF-1100 a MustChangePassword account still shows that state when it is not locked', () => {
    const account = sampleAccount({ state: 'MustChangePassword' });

    expect(accountState(account, fixtureNow)).toBe('MustChangePassword');
  });
});
