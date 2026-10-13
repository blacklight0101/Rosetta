import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { fixtureNow, fixturePassword, minutes } from '../../support/account-fixtures.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../support/postgres.js';
import {
  lockEvents,
  racingHasher,
  setUp,
  signInWith,
  type Setup,
} from '../../support/sign-in-race-setup.js';

// RF-1100, RF-1102, DEC-112, P1-133 on PostgreSQL: a successful sign-in writes only the sign-in
// columns and only while the account is still enabled with the password it read, so an
// administrator's disable or reset that lands between the read and the write is never undone and
// the sign-in is refused. Several sign-ins of one account at once keep the counter and the lock
// right. A lock that ends exactly now no longer locks.

const client = { ip: '203.0.113.7', userAgent: 'Browser/1.0' };
const wrongPassword = fixturePassword('Wrong');
const refused = { ok: false, error: ERROR_CODES.invalidCredentials };

describe.skipIf(!hasTestDatabase)('a sign-in success racing an administrator on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1102 a sign-in racing a disable keeps the account Disabled and is refused', async () => {
    const setup = await setUp(database);
    const disabled = { ...setup.amy, state: 'Disabled' as const, updatedAt: fixtureNow + 1 };
    const signIn = signInWith(setup, racingHasher(setup, disabled));

    const outcome = await signIn.execute({ userName: 'amy', password: setup.password, ...client });

    expect(outcome).toEqual(refused);
    expect(await setup.users.findById(setup.amy.id)).toEqual(disabled);
  });

  it('RF-1102 a sign-in racing a password reset keeps the new password and is refused', async () => {
    const setup = await setUp(database);
    const reset = {
      ...setup.amy,
      state: 'MustChangePassword' as const,
      passwordHash: await setup.hasher.hash(fixturePassword('Reset')),
      updatedAt: fixtureNow + 1,
    };
    const signIn = signInWith(setup, racingHasher(setup, reset));

    const outcome = await signIn.execute({ userName: 'amy', password: setup.password, ...client });

    expect(outcome).toEqual(refused);
    expect(await setup.users.findById(setup.amy.id)).toEqual(reset);
  });
});

describe.skipIf(!hasTestDatabase)('SignIn at the lock boundary on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1100 a sign-in at the instant the lock ends succeeds and clears the lock', async () => {
    const setup = await setUp(database);
    const now = testClock.now().getTime();
    await setup.users.update({
      ...setup.amy,
      failedSignIns: 5,
      firstFailedAt: now - minutes(15) + 1,
      lockedUntil: now,
    });
    const signIn = signInWith(setup, setup.hasher);

    const outcome = await signIn.execute({ userName: 'amy', password: setup.password, ...client });

    expect(outcome.ok).toBe(true);
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      failedSignIns: 0,
      lockedUntil: null,
      lastSignInAt: now,
    });
  });
});

type Guess = 'wrong' | 'correct';

async function signInAll(setup: Setup, guesses: readonly Guess[]) {
  const signIn = signInWith(setup, setup.hasher);
  return Promise.all(
    guesses.map((guess) =>
      signIn.execute({
        userName: 'amy',
        password: guess === 'correct' ? setup.password : wrongPassword,
        ...client,
      }),
    ),
  );
}

describe.skipIf(!hasTestDatabase)('parallel SignIn on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1100 parallel sign-ins run in turn: a success resets the counter, later failures count', async () => {
    const setup = await setUp(database);

    const outcomes = await signInAll(setup, [
      'wrong',
      'wrong',
      'correct',
      'wrong',
      'wrong',
      'wrong',
      'wrong',
    ]);

    expect(outcomes.map((outcome) => outcome.ok)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      failedSignIns: 4,
      lockedUntil: null,
    });
    expect(await lockEvents(setup)).toBe(0);
  });
});

describe.skipIf(!hasTestDatabase)('parallel SignIn locks on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1100 parallel sign-ins lock at the fifth failure after a success, once, and refuse later ones', async () => {
    const setup = await setUp(database);

    const outcomes = await signInAll(setup, [
      'wrong',
      'wrong',
      'wrong',
      'correct',
      'wrong',
      'wrong',
      'wrong',
      'wrong',
      'wrong',
      'correct',
    ]);

    expect(outcomes.map((outcome) => outcome.ok)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      failedSignIns: 5,
      lockedUntil: testClock.now().getTime() + minutes(15),
    });
    expect(await lockEvents(setup)).toBe(1);
  });
});

describe.skipIf(!hasTestDatabase)('parallel SignIn instances on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1100 eight wrong passwords on separate SignIn instances count to five and lock once', async () => {
    const setup = await setUp(database);

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        signInWith(setup, setup.hasher).execute({
          userName: 'amy',
          password: wrongPassword,
          ...client,
        }),
      ),
    );

    expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
    expect(await setup.users.findById(setup.amy.id)).toMatchObject({
      failedSignIns: 5,
      lockedUntil: testClock.now().getTime() + minutes(15),
    });
    expect(await lockEvents(setup)).toBe(1);
  });
});
