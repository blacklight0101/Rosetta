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

// RF-1100: given a wrong user name or password, the response time is the same whether or not the
// user exists. On PostgreSQL, a refused sign-in for an unknown user name sends the same statements,
// each with the same number of bound values, as a wrong password for a known one (the failure
// counter update included). That is the deterministic proof of equal database work; the scrypt
// derivation is counted by the unit test, and no wall-clock time is asserted (it is flaky).
// A known account fails once only, so no lock adds its own audit row.

const knownUser = 'known';
const parameters = { cost: 2 ** 12, blockSize: 8, parallelization: 1 } as const;
const request = { ip: '203.0.113.9', userAgent: 'Browser/1.0' };

interface Setup {
  readonly pool: DatabasePool;
  readonly signIn: SignIn;
}

/** A statement the pool received and how many values were bound to it. */
interface Sent {
  readonly statement: string;
  readonly values: number;
}

function boundCount(values: unknown): number {
  return Array.isArray(values) ? values.length : 0;
}

/** The statements one sign-in sends to the pool, in order, with their bound value counts. */
async function statementsOf(setup: Setup, userName: string): Promise<readonly Sent[]> {
  const query = vi.spyOn(setup.pool, 'query');
  try {
    const outcome = await setup.signIn.execute({
      ...request,
      userName,
      password: fixturePassword('Wrong'),
    });
    expect(outcome.ok).toBe(false);
    return query.mock.calls.map(([statement, values]) => ({
      statement: typeof statement === 'string' ? statement : 'config',
      values: boundCount(values),
    }));
  } finally {
    query.mockRestore();
  }
}

describe.skipIf(!hasTestDatabase)('sign-in database work on PostgreSQL', () => {
  const database = useTestDatabase();
  let setup: Setup;

  beforeAll(async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const hasher = new ScryptPasswordHasher({ parameters });
    const users = new PgUserRepository(pool);
    const passwordHash = await hasher.hash(fixturePassword(knownUser));
    await users.insert(sampleAccount({ userName: knownUser, passwordHash }));
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
  });

  it('RF-1100 an unknown user name runs the same statements as a wrong password', async () => {
    const known = await statementsOf(setup, knownUser);
    const unknown = await statementsOf(setup, 'nobody');

    expect(known.length).toBeGreaterThan(1);
    expect(known.filter((sent) => /^\s*UPDATE/i.test(sent.statement))).toHaveLength(1);
    expect(unknown).toEqual(known);
  });
});
