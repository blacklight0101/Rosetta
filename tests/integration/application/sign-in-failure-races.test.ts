import { describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../src/application/ports/password-hasher.js';
import { ChangePassword } from '../../../src/application/use-cases/change-password.js';
import { actorOf } from '../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import {
  commonPasswords,
  fixtureNow,
  fixturePassword,
  minutes,
} from '../../support/account-fixtures.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../support/postgres.js';
import { lockEvents, racingHasher, setUp, signInWith } from '../../support/sign-in-race-setup.js';

// RF-1100, RF-1102, RF-1103, DEC-112, P1-86 on PostgreSQL: a failed sign-in or password check is
// counted with one incrementing guarded UPDATE, so parallel wrong guesses each count until the
// fifth locks the account (once), and a failure that races an administrator's disable or reset
// never undoes it. A password change is saved only while the stored password hash is still the
// one it read, so a reset at the same update time wins.

const client = { ip: '203.0.113.7', userAgent: 'Browser/1.0' };
const wrongPassword = fixturePassword('Wrong');

describe.skipIf(!hasTestDatabase)('parallel failure counts on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1100 four parallel failures on the repository count four', async () => {
    const { users, amy } = await setUp(database);

    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () => users.countFailedSignIn(amy.id, fixtureNow)),
    );

    expect(outcomes).toEqual([false, false, false, false]);
    expect(await users.findById(amy.id)).toMatchObject({ failedSignIns: 4, lockedUntil: null });
  });

  it('RF-1100 eight parallel failures on the repository each count until the fifth locks', async () => {
    const { users, amy } = await setUp(database);

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => users.countFailedSignIn(amy.id, fixtureNow)),
    );

    expect(outcomes.filter((locked) => locked)).toHaveLength(1);
    expect(await users.findById(amy.id)).toMatchObject({
      failedSignIns: 5,
      firstFailedAt: fixtureNow,
      lockedUntil: fixtureNow + minutes(15),
    });
  });
});

describe.skipIf(!hasTestDatabase)('parallel wrong current passwords on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1103 eight parallel wrong current passwords count until the lock, locked once', async () => {
    const setup = await setUp(database);
    const changePassword = new ChangePassword({
      ...setup.parts,
      hasher: setup.hasher,
      commonPasswords,
    });

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        changePassword.execute({
          actor: actorOf(setup.amy),
          currentPassword: wrongPassword,
          newPassword: fixturePassword('Renewed'),
          ...client,
        }),
      ),
    );

    for (const outcome of outcomes) {
      expect(outcome).toEqual({ ok: false, error: ERROR_CODES.currentPasswordIncorrect });
    }
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      failedSignIns: 5,
      lockedUntil: testClock.now().getTime() + minutes(15),
    });
    expect(await lockEvents(setup)).toBe(1);
  });
});

describe.skipIf(!hasTestDatabase)('failures racing an administrator on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1102 a sign-in failure racing a disable leaves the account Disabled', async () => {
    const setup = await setUp(database);
    const disabled = { ...setup.amy, state: 'Disabled' as const, updatedAt: fixtureNow + 1 };
    const signIn = signInWith(setup, racingHasher(setup, disabled));

    const outcome = await signIn.execute({ userName: 'amy', password: wrongPassword, ...client });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.invalidCredentials });
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      state: 'Disabled',
      failedSignIns: 1,
    });
  });

  it('RF-1102 a sign-in failure racing a password reset keeps the new password', async () => {
    const setup = await setUp(database);
    const reset = {
      ...setup.amy,
      state: 'MustChangePassword' as const,
      passwordHash: await setup.hasher.hash(fixturePassword('Reset')),
      updatedAt: fixtureNow + 1,
    };
    const signIn = signInWith(setup, racingHasher(setup, reset));

    await signIn.execute({ userName: 'amy', password: wrongPassword, ...client });

    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      state: 'MustChangePassword',
      passwordHash: reset.passwordHash,
      failedSignIns: 1,
    });
  });
});

describe.skipIf(!hasTestDatabase)('a password change racing a reset on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1103 a password change racing a reset at the same update time is refused', async () => {
    const setup = await setUp(database);
    const resetHash = await setup.hasher.hash(fixturePassword('Reset'));
    const racing: PasswordHasher = {
      hash: async (next) => {
        await setup.users.update({ ...setup.amy, passwordHash: resetHash });
        return setup.hasher.hash(next);
      },
      verify: (candidate, hash) => setup.hasher.verify(candidate, hash),
    };
    const changePassword = new ChangePassword({ ...setup.parts, hasher: racing, commonPasswords });

    const outcome = await changePassword.execute({
      actor: actorOf(setup.amy),
      currentPassword: setup.password,
      newPassword: fixturePassword('Renewed'),
      ...client,
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.accountStateInvalid });
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({ passwordHash: resetHash });
  });
});
