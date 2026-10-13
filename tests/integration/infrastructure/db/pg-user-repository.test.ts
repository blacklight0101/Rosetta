import { describe } from 'vitest';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { failedSignInCounterContract } from '../../../contracts/failed-sign-in-counter.contract.js';
import { userRepositoryContract } from '../../../contracts/user-repository.contract.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016: PgUserRepository passes the UserRepository contract and the
// failed sign-in counter contract (P1-86) on the disposable PostgreSQL, one migrated schema per
// test.
describe.skipIf(!hasTestDatabase)('PgUserRepository', () => {
  const database = useTestDatabase();
  const fresh = async () => {
    const { pool } = await database.createSchema({ migrate: true });
    return new PgUserRepository(pool);
  };

  userRepositoryContract('PgUserRepository', fresh);
  failedSignInCounterContract('PgUserRepository', fresh);
});
