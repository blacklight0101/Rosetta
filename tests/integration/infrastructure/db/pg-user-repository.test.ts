import { describe } from 'vitest';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { failedSignInCounterContract } from '../../../contracts/failed-sign-in-counter.contract.js';
import { userRepositoryContract } from '../../../contracts/user-repository.contract.js';
import { successfulSignInContract } from '../../../contracts/successful-sign-in.contract.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016: PgUserRepository passes the UserRepository contract and the
// failed sign-in counter contract (P1-86) on the disposable PostgreSQL, one migrated schema per
// test.
describe.skipIf(!hasTestDatabase)('PgUserRepository', () => {
  const database = useTestDatabase();
  let currentPool: DatabasePool | undefined;
  const fresh = async () => {
    const { pool } = await database.createSchema({ migrate: true });
    currentPool = pool;
    return new PgUserRepository(pool);
  };
  // A lock written with microseconds, as a database now() or a manual SQL fix can write it.
  const storeLockedUntil = async (id: string, instant: string) => {
    if (currentPool === undefined) throw new Error('no test schema');
    await currentPool.query('UPDATE users SET locked_until = $2::timestamptz WHERE id = $1', [
      id,
      instant,
    ]);
  };

  userRepositoryContract('PgUserRepository', fresh);
  failedSignInCounterContract('PgUserRepository', fresh);
  successfulSignInContract('PgUserRepository', fresh, { storeLockedUntil });
});
