import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { accountAdminHarness, client } from '../../../support/account-admin-harness.js';

// RF-1102: the administrator creates an account with user name, display name, role, an initial
// password and whether it must be changed at first sign-in (default on); RF-1107: off for the
// teacher account. RF-1109: the creation is audited without the password.

const password = fixturePassword('Initial');
const request = {
  userName: 'Teacher',
  displayName: 'The Teacher',
  role: 'user',
  password,
  ...client,
} as const;

describe('CreateUser', () => {
  it('RF-1102 creates the account; by default its password must be changed at first sign-in', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.createUser.execute({ actor: test.admin.actor, ...request });

    expect(outcome).toMatchObject({
      ok: true,
      value: {
        userName: 'teacher',
        displayName: 'The Teacher',
        role: 'user',
        state: 'MustChangePassword',
      },
    });
    const stored = await test.users.findByUserName('teacher');
    expect(await test.hasher.verify(password, stored?.passwordHash ?? '')).toBe(true);
  });

  it('RF-1107 creates an account that needs no change at first sign-in', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.createUser.execute({
      actor: test.admin.actor,
      ...request,
      mustChangePassword: false,
    });

    expect(outcome.ok && outcome.value.state).toBe('Active');
  });
});

describe('CreateUser roles', () => {
  it('RF-1102 creates an administrator', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.createUser.execute({
      actor: test.admin.actor,
      ...request,
      role: 'admin',
    });

    expect(outcome.ok && outcome.value.role).toBe('admin');
  });

  it('RF-1102 answers the account without its password hash', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.createUser.execute({ actor: test.admin.actor, ...request });

    expect(JSON.stringify(outcome)).not.toContain('fake$');
  });
});

describe('CreateUser refusals and audit', () => {
  it.each([
    ['a user that is not an administrator', 'user', {}, ERROR_CODES.notAllowed],
    ['an invalid user name', 'admin', { userName: 'a b' }, ERROR_CODES.userNameInvalid],
    ['an empty display name', 'admin', { displayName: ' ' }, ERROR_CODES.displayNameInvalid],
    ['a short password', 'admin', { password: 'Short-pw1' }, ERROR_CODES.passwordTooShort],
    [
      'a common password',
      'admin',
      { password: ['pass', 'word', '1234'].join('') },
      ERROR_CODES.passwordTooCommon,
    ],
    [
      'a password with the user name',
      'admin',
      { password: 'teacher-phrase-2026' },
      ERROR_CODES.passwordContainsUserName,
    ],
    ['a user name that is taken', 'admin', { userName: 'AMY' }, ERROR_CODES.userNameTaken],
  ] as const)('RF-1102 refuses %s and stores nothing', async (_case, role, change, code) => {
    const test = await accountAdminHarness();
    const actor = role === 'admin' ? test.admin.actor : test.amy.actor;
    const before = await test.users.list();

    const outcome = await test.createUser.execute({ actor, ...request, ...change });

    expect(outcome).toEqual({ ok: false, error: code });
    expect(await test.users.list()).toEqual(before);
  });

  it('RF-1109 audits the creation without the password', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.createUser.execute({ actor: test.admin.actor, ...request });

    const rows = await test.auditLog.list({ since: 0 });
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'user.created',
        actorUserId: test.admin.account.id,
        targetType: 'user',
        targetId: outcome.ok ? outcome.value.id : 'none',
        ip: client.ip,
        outcome: 'ok',
        detail: { role: 'user', changeAtFirstSignIn: true },
      }),
    ]);
    expect(JSON.stringify(rows) + test.logger.text()).not.toContain(password);
  });
});
