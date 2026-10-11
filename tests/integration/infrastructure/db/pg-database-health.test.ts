import { afterAll, describe } from 'vitest';
import { PgDatabaseHealth } from '../../../../src/infrastructure/db/pg-database-health.js';
import { createPool, type DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { databaseHealthContract } from '../../../contracts/database-health.contract.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-1303: the probe behind GET /healthz against the disposable PostgreSQL, and against a
// loopback port where nothing listens.

function ignoreIdleError(): void {
  // The pool to the closed port never holds an idle connection.
}

describe.skipIf(!hasTestDatabase)('PgDatabaseHealth', () => {
  const database = useTestDatabase();
  const closed: DatabasePool[] = [];

  afterAll(async () => {
    await Promise.all(closed.map((pool) => pool.end()));
  });

  databaseHealthContract('PgDatabaseHealth', {
    up: async () => {
      const { pool } = await database.createSchema({ migrate: false });
      return new PgDatabaseHealth(pool);
    },
    down: () => {
      const pool = createPool({
        connectionString: 'postgres://rosetta@127.0.0.1:1/rosetta',
        onIdleError: ignoreIdleError,
      });
      closed.push(pool);
      return Promise.resolve(new PgDatabaseHealth(pool));
    },
  });
});
