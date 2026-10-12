import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import {
  accountAdminHarness,
  client,
  type AccountAdminHarness,
} from '../../../support/account-admin-harness.js';

// RF-1103: a user changes their password with the current one; the new one meets the rules of
// P1-08, the other sessions end and MustChangePassword is cleared (RF-1102). RF-1109: the change
// is audited and no row or log entry holds a password.

const newPassword = fixturePassword('Renewed');

function openSession(test: AccountAdminHarness) {
  return test.sessions.create({ userId: test.amy.account.id, ...client, now: test.clock.now() });
}

function change(
  test: AccountAdminHarness,
  overrides: { currentPassword?: string; newPassword?: string } = {},
) {
  return test.changePassword.execute({
    actor: test.amy.actor,
    currentPassword: test.amy.password,
    newPassword,
    ...client,
    ...overrides,
  });
}

describe('ChangePassword', () => {
  it('RF-1103 accepts a new password that meets every rule', async () => {
    const test = await accountAdminHarness();

    const outcome = await change(test);

    expect(outcome.ok).toBe(true);
    const stored = await test.users.findById(test.amy.account.id);
    expect(await test.hasher.verify(newPassword, stored?.passwordHash ?? '')).toBe(true);
  });

  it.each([
    ['shorter than 12 characters', 'Short-pw1', ERROR_CODES.passwordTooShort],
    [
      'on the common-passwords list',
      ['Pass', 'word', '1234'].join(''),
      ERROR_CODES.passwordTooCommon,
    ],
    ['containing the user name', 'my-AMY-password-phrase', ERROR_CODES.passwordContainsUserName],
  ])('RF-1103 refuses a new password %s and keeps the old one', async (_rule, candidate, code) => {
    const test = await accountAdminHarness();

    const outcome = await change(test, { newPassword: candidate });

    expect(outcome).toEqual({ ok: false, error: code });
    expect(await test.users.findById(test.amy.account.id)).toEqual(test.amy.account);
  });

  it('RF-1103 refuses a wrong current password, audits it and logs a security event', async () => {
    const test = await accountAdminHarness();

    const outcome = await change(test, { currentPassword: fixturePassword('Wrong') });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.currentPasswordIncorrect });
    expect(await test.users.findById(test.amy.account.id)).toEqual(test.amy.account);
    const [audited] = await test.auditLog.list({ since: 0 });
    expect(audited).toMatchObject({ action: 'user.password_changed', outcome: 'refused' });
    expect(test.logger.records).toContainEqual(
      expect.objectContaining({ logger: 'security', code: ERROR_CODES.currentPasswordIncorrect }),
    );
  });
});

describe('ChangePassword sessions and audit', () => {
  it('RF-1103 ends my other sessions and opens a new one for this browser', async () => {
    const test = await accountAdminHarness();
    const here = await openSession(test);
    const elsewhere = await openSession(test);

    const outcome = await change(test);

    if (!outcome.ok) throw new Error('the change was refused');
    expect(await test.sessions.touch(here.id, test.clock.now())).toBeUndefined();
    expect(await test.sessions.touch(elsewhere.id, test.clock.now())).toBeUndefined();
    expect(await test.sessions.touch(outcome.value.sessionId, test.clock.now())).toMatchObject({
      userId: test.amy.account.id,
    });
  });

  it('RF-1102 clears MustChangePassword', async () => {
    const test = await accountAdminHarness();
    await test.users.update({ ...test.amy.account, state: 'MustChangePassword' });

    const outcome = await change(test);

    expect(outcome.ok && outcome.value.user.state).toBe('Active');
    expect((await test.users.findById(test.amy.account.id))?.state).toBe('Active');
  });
});

describe('ChangePassword audit', () => {
  it('RF-1103 refuses an account that is gone', async () => {
    const test = await accountAdminHarness();

    const outcome = await test.changePassword.execute({
      actor: { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' },
      currentPassword: test.amy.password,
      newPassword,
      ...client,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it('RF-1109 audits the change without any password in a row or a log entry', async () => {
    const test = await accountAdminHarness();

    await change(test);

    const rows = await test.auditLog.list({ since: 0 });
    expect(rows).toEqual([
      expect.objectContaining({
        action: 'user.password_changed',
        actorUserId: test.amy.account.id,
        targetId: test.amy.account.id,
        ip: client.ip,
        outcome: 'ok',
      }),
    ]);
    const trail = JSON.stringify(rows) + test.logger.text();
    expect(trail).not.toContain(newPassword);
    expect(trail).not.toContain(test.amy.password);
  });
});
