import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SignIn } from '../../../src/application/use-cases/sign-in.js';
import { PgAuditLog } from '../../../src/infrastructure/db/pg-audit-log.js';
import { PgSessionStore } from '../../../src/infrastructure/db/pg-session-store.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../../../src/infrastructure/db/pool.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { createDummyHash } from '../../../src/infrastructure/security/dummy-password-hash.js';
import { ScryptPasswordHasher } from '../../../src/infrastructure/security/scrypt-password-hasher.js';
import { fixturePassword, sampleAccount } from '../../support/account-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { timedAsync } from '../../support/stopwatch.js';

// RF-1100: given a wrong user name or password, the response time is the same whether or not the
// user exists. On PostgreSQL, a refused sign-in for an unknown user name runs the same statements
// as a wrong password for a known one (the failure counter update included); that comparison is
// the gate for equal database work. The timing test checks the visible property end to end with
// the production scrypt cost: the fastest refusal of each series (the least noisy estimate of
// its own cost) stays within half of the other, a bound far above the noise of a loaded runner.
// Every known account fails once only, so no lock adds its own audit row.

const samples = 25;
const parameters = { cost: 2 ** 14, blockSize: 8, parallelization: 1 } as const;
const request = { ip: '203.0.113.9', userAgent: 'Browser/1.0' };

interface Setup {
  readonly pool: DatabasePool;
  readonly signIn: SignIn;
}

function fastest(values: readonly number[]): number {
  return Math.min(...values);
}

/** The statements one sign-in sends to the pool, in order. */
async function statementsOf(setup: Setup, userName: string): Promise<readonly string[]> {
  const query = vi.spyOn(setup.pool, 'query');
  try {
    const outcome = await setup.signIn.execute({
      ...request,
      userName,
      password: fixturePassword('Wrong'),
    });
    expect(outcome.ok).toBe(false);
    return query.mock.calls.map(([statement]) =>
      typeof statement === 'string' ? statement : 'config',
    );
  } finally {
    query.mockRestore();
  }
}

async function timeRefusal(setup: Setup, userName: string): Promise<number> {
  const { result, ms } = await timedAsync(() =>
    setup.signIn.execute({ ...request, userName, password: fixturePassword('Wrong') }),
  );
  expect(result.ok).toBe(false);
  return ms;
}

describe.skipIf(!hasTestDatabase)('sign-in database work on PostgreSQL', () => {
  const database = useTestDatabase();
  let setup: Setup;

  beforeAll(async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const hasher = new ScryptPasswordHasher({ parameters });
    const users = new PgUserRepository(pool);
    for (let index = 0; index <= samples; index += 1) {
      const userName = `known${String(index)}`;
      const passwordHash = await hasher.hash(fixturePassword(userName));
      await users.insert(sampleAccount({ userName, passwordHash }));
    }
    const signIn = new SignIn({
      users,
      hasher,
      sessions: new PgSessionStore(pool),
      auditLog: new PgAuditLog(pool, new SecretMasker()),
      logger: new RecordingLogger(),
      clock: new FixedClock('2026-10-11T09:00:00.000Z'),
      dummyHash: await createDummyHash(hasher),
    });
    setup = { pool, signIn };
  }, 30_000);

  it('RF-1100 an unknown user name runs the same statements as a wrong password', async () => {
    const known = await statementsOf(setup, `known${String(samples)}`);
    const unknown = await statementsOf(setup, 'nobody');

    expect(known.length).toBeGreaterThan(1);
    expect(unknown).toEqual(known);
  });

  it('RF-1100 an unknown user name takes as long as a wrong password on PostgreSQL', async () => {
    const known: number[] = [];
    const unknown: number[] = [];
    // Interleaved, so a slow moment of the machine hits both series alike.
    for (let index = 0; index < samples; index += 1) {
      known.push(await timeRefusal(setup, `known${String(index)}`));
      unknown.push(await timeRefusal(setup, `nobody${String(index)}`));
    }

    const knownFastest = fastest(known);
    const unknownFastest = fastest(unknown);

    expect(Math.abs(knownFastest - unknownFastest)).toBeLessThan(
      0.5 * Math.max(knownFastest, unknownFastest),
    );
  }, 60_000);
});
