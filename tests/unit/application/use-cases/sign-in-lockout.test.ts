import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixtureNow, fixturePassword, minutes } from '../../../support/account-fixtures.js';
import { request, signInHarness as harness } from '../../../support/sign-in-harness.js';

// RF-1100: a correct user name and password start a session; a wrong user name or password is
// refused with only "User name or password is incorrect", taking the same work whether or not the
// user exists; five failures within 15 minutes lock the account for 15 minutes and log a security
// event. RF-1101: the previous session id is discarded. RF-1109: every attempt is audited, never
// with the password.

describe('SignIn lockout', () => {
  it('RF-1100 five failures within 15 minutes lock the account; the next attempt is refused and logged', async () => {
    const { signIn, password, clock, auditLog, logger } = await harness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      clock.advance(minutes(2));
      await signIn.execute({ userName: 'amy', password: fixturePassword('Wrong'), ...request });
    }

    const locked = await signIn.execute({ userName: 'amy', password, ...request });

    expect(locked).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    const actions = (await auditLog.list({ since: 0 })).map((event) => event.action);
    expect(actions.filter((action) => action === 'auth.locked')).toHaveLength(1);
    const lockEvents = logger.records.filter((record) => record.code === ERROR_CODES.accountLocked);
    expect(lockEvents).toHaveLength(2);
    expect(
      lockEvents.every((record) => record.level === 'warn' && record.logger === 'security'),
    ).toBe(true);
  });
});

describe('SignIn lock expiry', () => {
  it('RF-1100 the lock ends after 15 minutes', async () => {
    const { signIn, password, clock } = await harness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn.execute({ userName: 'amy', password: fixturePassword('Wrong'), ...request });
    }

    clock.advance(minutes(14));
    const stillLocked = await signIn.execute({ userName: 'amy', password, ...request });
    clock.advance(minutes(1));
    const unlocked = await signIn.execute({ userName: 'amy', password, ...request });

    expect(stillLocked.ok).toBe(false);
    expect(unlocked.ok).toBe(true);
  });
});

describe('SignIn lockout under load', () => {
  it('RF-1100 five parallel failures are counted one by one and lock the account', async () => {
    const { signIn, users, account } = await harness();

    await Promise.all(
      Array.from({ length: 5 }, () =>
        signIn.execute({ userName: 'amy', password: fixturePassword('Wrong'), ...request }),
      ),
    );

    expect(await users.findById(account.id)).toMatchObject({
      failedSignIns: 5,
      lockedUntil: fixtureNow + minutes(15),
    });
  });

  it('RF-1109 no password reaches the audit trail or the log', async () => {
    const { signIn, password, auditLog, logger } = await harness();
    const wrong = fixturePassword('Wrong');

    await signIn.execute({ userName: 'amy', password: wrong, ...request });
    await signIn.execute({ userName: 'amy', password, ...request });

    const trail = JSON.stringify(await auditLog.list({ since: 0 })) + logger.text();
    expect(trail).not.toContain(password);
    expect(trail).not.toContain(wrong);
  });
});
