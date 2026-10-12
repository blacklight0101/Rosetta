import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import {
  accountAdminHarness,
  client,
  type AccountAdminHarness,
} from '../../../support/account-admin-harness.js';

// RF-1102, RF-1101: the administrator disables, enables or resets the password of an account; the
// change takes effect at once (all sessions of the account end) and an audit event is written
// (RF-1109) without the password.

const unknownId = '00000000-0000-4000-9000-0000000000ff';
const resetTo = fixturePassword('Reset');

function openSession(test: AccountAdminHarness) {
  return test.sessions.create({ userId: test.amy.account.id, ...client, now: test.clock.now() });
}

function disableAmy(test: AccountAdminHarness) {
  return test.updateUser.execute({
    actor: test.admin.actor,
    userId: test.amy.account.id,
    change: 'disable',
    ip: client.ip,
  });
}

describe('UpdateUser', () => {
  it('RF-1102 disabling an account ends all its sessions at once', async () => {
    const test = await accountAdminHarness();
    const session = await openSession(test);

    const outcome = await disableAmy(test);

    expect(outcome).toMatchObject({
      ok: true,
      value: { id: test.amy.account.id, state: 'Disabled' },
    });
    expect(await test.sessions.touch(session.id, test.clock.now())).toBeUndefined();
    expect((await test.users.findById(test.amy.account.id))?.state).toBe('Disabled');
  });

  it('RF-1102 enabling a disabled account makes it active again', async () => {
    const test = await accountAdminHarness();
    await disableAmy(test);

    const outcome = await test.updateUser.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      change: 'enable',
      ip: client.ip,
    });

    expect(outcome).toMatchObject({ ok: true, value: { state: 'Active' } });
  });

  it('RF-1102 enabling an account that is not disabled is refused', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.updateUser.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      change: 'enable',
      ip: client.ip,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.accountStateInvalid });
  });
});

describe('UpdateUser refusals and audit', () => {
  it.each([
    ['a user that is not an administrator', 'amy', 'amy-target', ERROR_CODES.notAllowed],
    ['an unknown account', 'root', 'unknown', ERROR_CODES.notFound],
    ["the administrator's own account", 'root', 'root', ERROR_CODES.ownAccountRefused],
  ] as const)('RF-1102 refuses to disable for %s', async (_case, who, target, code) => {
    const test = await accountAdminHarness();
    const actor = who === 'root' ? test.admin.actor : test.amy.actor;
    const ids = {
      'amy-target': test.admin.account.id,
      unknown: unknownId,
      root: test.admin.account.id,
    };

    const outcome = await test.updateUser.execute({
      actor,
      userId: ids[target],
      change: 'disable',
      ip: client.ip,
    });

    expect(outcome).toEqual({ ok: false, error: code });
    expect(await test.auditLog.list({ since: 0 })).toEqual([]);
  });

  it('RF-1109 audits disabling and enabling with the number of sessions ended', async () => {
    const test = await accountAdminHarness();
    await openSession(test);

    await disableAmy(test);
    await test.updateUser.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      change: 'enable',
      ip: client.ip,
    });

    const rows = await test.auditLog.list({ since: 0 });
    expect(rows.map((row) => [row.action, row.targetId, row.detail])).toEqual([
      ['user.enabled', test.amy.account.id, {}],
      ['user.disabled', test.amy.account.id, { endedSessions: 1 }],
    ]);
  });
});

describe('ResetPassword', () => {
  it('RF-1102 sets the new password, ends all sessions and requires a change at next sign-in', async () => {
    const test = await accountAdminHarness();
    const session = await openSession(test);

    const outcome = await test.resetPassword.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      password: resetTo,
      ip: client.ip,
    });

    expect(outcome).toMatchObject({ ok: true, value: { state: 'MustChangePassword' } });
    const stored = await test.users.findById(test.amy.account.id);
    expect(await test.hasher.verify(resetTo, stored?.passwordHash ?? '')).toBe(true);
    expect(await test.sessions.touch(session.id, test.clock.now())).toBeUndefined();
  });
});

describe('ResetPassword rules', () => {
  it.each([
    ['a short password', 'Short-pw1', ERROR_CODES.passwordTooShort],
    [
      'a password with the user name',
      'amy-reset-phrase-2026',
      ERROR_CODES.passwordContainsUserName,
    ],
  ])('RF-1102 refuses %s', async (_case, password, code) => {
    const test = await accountAdminHarness();

    const outcome = await test.resetPassword.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      password,
      ip: client.ip,
    });

    expect(outcome).toEqual({ ok: false, error: code });
    expect(await test.users.findById(test.amy.account.id)).toEqual(test.amy.account);
  });

  it('RF-1102 refuses to reset a disabled account', async () => {
    const test = await accountAdminHarness();
    await disableAmy(test);

    const outcome = await test.resetPassword.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      password: resetTo,
      ip: client.ip,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.accountStateInvalid });
  });
});

describe('ResetPassword refusals and audit', () => {
  it('RF-1102 refuses a user that is not an administrator', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.resetPassword.execute({
      actor: test.amy.actor,
      userId: test.admin.account.id,
      password: resetTo,
      ip: client.ip,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
  });

  it('RF-1109 audits the reset without the password', async () => {
    const test = await accountAdminHarness();

    await test.resetPassword.execute({
      actor: test.admin.actor,
      userId: test.amy.account.id,
      password: resetTo,
      ip: client.ip,
    });

    const rows = await test.auditLog.list({ since: 0 });
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'user.password_reset',
        actorUserId: test.admin.account.id,
        targetId: test.amy.account.id,
        outcome: 'ok',
        detail: { endedSessions: 0 },
      }),
    ]);
    expect(JSON.stringify(rows) + test.logger.text()).not.toContain(resetTo);
  });
});
