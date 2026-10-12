import { describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../../src/application/ports/password-hasher.js';
import { ChangePassword } from '../../../../src/application/use-cases/change-password.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  commonPasswords,
  FakePasswordHasher,
  fixturePassword,
} from '../../../support/account-fixtures.js';
import {
  accountAdminHarness,
  client,
  type AccountAdminHarness,
} from '../../../support/account-admin-harness.js';

// RF-1103, RF-1102: the guards of a password change. The new password must differ from the
// current one, or a MustChangePassword account could keep its password (RST-2214). A wrong current
// password counts toward the sign-in failure window (RF-1100, DEC-112: five in 15 minutes lock the
// account for 15 minutes), so a stolen session cannot guess without a lockout. A change that
// races an administrator's change of the account is refused and never undoes it (RST-2208).

const newPassword = fixturePassword('Renewed');

function change(test: AccountAdminHarness, currentPassword: string, next = newPassword) {
  return test.changePassword.execute({
    actor: test.amy.actor,
    currentPassword,
    newPassword: next,
    ...client,
  });
}

describe('ChangePassword new password', () => {
  it('RF-1103 refuses a new password equal to the current one', async () => {
    const test = await accountAdminHarness();
    await test.users.update({ ...test.amy.account, state: 'MustChangePassword' });

    const outcome = await change(test, test.amy.password, test.amy.password);

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.passwordUnchanged });
    expect((await test.users.findById(test.amy.account.id))?.state).toBe('MustChangePassword');
  });
});

describe('ChangePassword failure window', () => {
  it('RF-1100 five wrong current passwords lock the account, then even the right one is refused', async () => {
    const test = await accountAdminHarness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await change(test, fixturePassword('Wrong'));
    }

    const outcome = await change(test, test.amy.password);

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.currentPasswordIncorrect });
    const stored = await test.users.findById(test.amy.account.id);
    expect(stored?.passwordHash).toBe(test.amy.account.passwordHash);
    expect(stored?.lockedUntil).toBe(test.clock.now().getTime() + 15 * 60_000);
    const locked = await test.auditLog.list({ since: 0, action: 'auth.locked' });
    expect(locked).toHaveLength(1);
  });

  it('RF-1100 a successful change clears the failure counters', async () => {
    const test = await accountAdminHarness();
    await change(test, fixturePassword('Wrong'));

    await change(test, test.amy.password);

    expect(await test.users.findById(test.amy.account.id)).toMatchObject({
      failedSignIns: 0,
      firstFailedAt: null,
    });
  });
});

describe('ChangePassword against a concurrent administrator change', () => {
  it('RF-1102 a change that races a disable is refused and the account stays disabled', async () => {
    const test = await accountAdminHarness();
    const inner = new FakePasswordHasher();
    const racing: PasswordHasher = {
      hash: async (password) => {
        const current = await test.users.findById(test.amy.account.id);
        if (current !== undefined) await test.users.update({ ...current, state: 'Disabled' });
        return inner.hash(password);
      },
      verify: (password, hash) => inner.verify(password, hash),
    };
    const { users, sessions, auditLog, logger, clock } = test;
    const changePassword = new ChangePassword({
      ...{ users, sessions, auditLog, logger, clock, commonPasswords },
      hasher: racing,
    });

    const outcome = await changePassword.execute({
      actor: test.amy.actor,
      currentPassword: test.amy.password,
      newPassword,
      ...client,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.accountStateInvalid });
    expect(await test.users.findById(test.amy.account.id)).toMatchObject({
      state: 'Disabled',
      passwordHash: test.amy.account.passwordHash,
    });
  });
});
