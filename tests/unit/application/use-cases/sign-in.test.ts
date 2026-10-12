import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { fixtureNow, fixturePassword, minutes } from '../../../support/account-fixtures.js';
import { dummyHash, request, signInHarness as harness } from '../../../support/sign-in-harness.js';

// RF-1100: a correct user name and password start a session; a wrong user name or password is
// refused with only "User name or password is incorrect", taking the same work whether or not the
// user exists; five failures within 15 minutes lock the account for 15 minutes and log a security
// event. RF-1101: the previous session id is discarded. RF-1109: every attempt is audited, never
// with the password.

describe('SignIn success', () => {
  it('RF-1100 a correct user name and password start a session for the account', async () => {
    const { signIn, password, account, sessions, users, auditLog, logger } = await harness({
      failedSignIns: 2,
      firstFailedAt: fixtureNow - minutes(1),
    });

    const outcome = await signIn.execute({ userName: ' AMY ', password, ...request });

    expect(outcome).toEqual({
      ok: true,
      value: {
        sessionId: `sess-1-`.padEnd(43, 'x'),
        user: {
          id: account.id,
          userName: 'amy',
          displayName: 'Sample User',
          role: 'user',
          state: 'Active',
        },
      },
    });
    const session = await sessions.touch(`sess-1-`.padEnd(43, 'x'), new Date(fixtureNow));
    expect(session).toMatchObject({
      userId: account.id,
      ip: '203.0.113.7',
      userAgent: 'Browser/1.0',
    });
    expect(await users.findById(account.id)).toMatchObject({
      failedSignIns: 0,
      firstFailedAt: null,
      lastSignInAt: fixtureNow,
    });
    const [audited] = await auditLog.list({ since: new Date(0) });
    expect(audited).toMatchObject({
      action: 'auth.sign_in',
      outcome: 'ok',
      actorUserId: account.id,
    });
    expect(logger.records).toContainEqual(
      expect.objectContaining({ level: 'info', message: 'Signed in.' }),
    );
  });
});

describe('SignIn state shown', () => {
  it('RF-1100 an account that must change its password signs in and says so', async () => {
    const { signIn, password } = await harness({ state: 'MustChangePassword' });

    const outcome = await signIn.execute({ userName: 'amy', password, ...request });

    expect(outcome.ok && outcome.value.user.state).toBe('MustChangePassword');
  });
});

describe('SignIn session rotation', () => {
  it('RF-1101 the session id the browser had is ended and a new one is created', async () => {
    const { signIn, password, sessions, account } = await harness();
    const previous = await sessions.create({
      userId: account.id,
      ip: '',
      userAgent: '',
      now: new Date(fixtureNow),
    });

    const outcome = await signIn.execute({
      userName: 'amy',
      password,
      ...request,
      previousSessionId: previous.id,
    });

    expect(outcome.ok && outcome.value.sessionId).not.toBe(previous.id);
    expect(await sessions.touch(previous.id, new Date(fixtureNow))).toBeUndefined();
    expect(sessions.storedKeys()).toHaveLength(1);
  });
});

describe('SignIn refusals', () => {
  it('RF-1100 a wrong password is refused with RST-2201, counted, audited and logged', async () => {
    const { signIn, account, users, auditLog, logger } = await harness();

    const outcome = await signIn.execute({
      userName: 'amy',
      password: fixturePassword('Wrong'),
      ...request,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    expect(await users.findById(account.id)).toMatchObject({
      failedSignIns: 1,
      firstFailedAt: fixtureNow,
    });
    const [audited] = await auditLog.list({ since: new Date(0) });
    expect(audited).toMatchObject({
      action: 'auth.sign_in',
      outcome: 'refused',
      actorUserId: null,
      targetId: account.id,
      ip: '203.0.113.7',
      detail: { reason: 'wrong-password' },
    });
    expect(logger.records).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        logger: 'security',
        code: ERROR_CODES.invalidCredentials,
      }),
    );
  });
});

describe('SignIn unknown user names', () => {
  it('RF-1100 an unknown user name gets the same refusal after verifying the dummy hash', async () => {
    const { signIn, hasher, auditLog, sessions } = await harness();

    const unknown = await signIn.execute({
      userName: 'nobody',
      password: fixturePassword('X'),
      ...request,
    });
    const invalidName = await signIn.execute({
      userName: 'No Body!',
      password: fixturePassword('X'),
      ...request,
    });

    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    expect(invalidName).toEqual(unknown);
    expect(hasher.verified).toEqual([dummyHash, dummyHash]);
    const audited = await auditLog.list({ since: new Date(0) });
    expect(audited[0]).toMatchObject({ targetId: null, detail: { reason: 'unknown-user' } });
    expect(sessions.storedKeys()).toEqual([]);
  });

  it('RF-1100 a known user name verifies its own hash exactly once, like an unknown one', async () => {
    const { signIn, hasher, account } = await harness();

    await signIn.execute({ userName: 'amy', password: fixturePassword('Wrong'), ...request });

    expect(hasher.verified).toEqual([account.passwordHash]);
  });
});

describe('SignIn refusals by account state', () => {
  it('RF-1100 a disabled account is refused with the same message, even with its password', async () => {
    const { signIn, password, auditLog } = await harness({ state: 'Disabled' });

    const outcome = await signIn.execute({ userName: 'amy', password, ...request });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    expect((await auditLog.list({ since: new Date(0) }))[0]?.detail).toEqual({
      reason: 'disabled',
    });
  });
});

describe('SignIn hasher failures', () => {
  it('RF-1100 an unreadable stored hash counts as a wrong password and is logged as RST-2209', async () => {
    const { signIn, hasher, logger } = await harness();
    hasher.verify = () => Promise.reject(new RosettaError(ERROR_CODES.passwordHashInvalid));

    const outcome = await signIn.execute({
      userName: 'amy',
      password: fixturePassword('X'),
      ...request,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    expect(logger.records).toContainEqual(
      expect.objectContaining({ level: 'error', code: ERROR_CODES.passwordHashInvalid }),
    );
  });

  it('RF-1100 another failure of the hasher is not hidden', async () => {
    const { signIn, hasher } = await harness();
    hasher.verify = () => Promise.reject(new Error('out of memory'));

    await expect(
      signIn.execute({ userName: 'amy', password: fixturePassword('X'), ...request }),
    ).rejects.toThrow('out of memory');
  });
});
