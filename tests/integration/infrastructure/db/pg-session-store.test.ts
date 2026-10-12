import { describe } from 'vitest';
import { PgSessionStore } from '../../../../src/infrastructure/db/pg-session-store.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { sessionStoreContract } from '../../../contracts/session-store.contract.js';

// Architecture section 7, ADR-016: PgSessionStore passes the SessionStore contract on the
// disposable PostgreSQL, one migrated schema per test; the stored key is the `id_hash` column.
describe.skipIf(!hasTestDatabase)('PgSessionStore', () => {
  const database = useTestDatabase();

  sessionStoreContract('PgSessionStore', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    const first = sampleAccount();
    const second = sampleAccount();
    await users.insert(first);
    await users.insert(second);
    return {
      store: new PgSessionStore(pool),
      userIds: [first.id, second.id],
      storedHashes: async () => {
        const result = await pool.query<{ hash: string }>(
          "SELECT encode(id_hash, 'hex') AS hash FROM sessions ORDER BY hash",
        );
        return result.rows.map((row) => row.hash);
      },
    };
  });
});
