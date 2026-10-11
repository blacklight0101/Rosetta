import { describe } from 'vitest';
import { PgMigrator } from '../../../../src/infrastructure/db/pg-migrator.js';
import { migratorContract, type MigratorStore } from '../../../contracts/migrator.contract.js';
import { hasTestDatabase, testClock, useTestDatabase } from '../../../support/postgres.js';

describe.skipIf(!hasTestDatabase)('PgMigrator', () => {
  const database = useTestDatabase();

  async function fresh(): Promise<MigratorStore> {
    const { pool } = await database.createSchema({ migrate: false });
    return {
      migratorFor: (migrations) => new PgMigrator({ pool, migrations, clock: testClock }),
      async recorded() {
        const result = await pool.query<{ version: number; name: string; checksum: string }>(
          'SELECT version, name, checksum FROM schema_version ORDER BY version',
        );
        return result.rows;
      },
      async tableExists(table) {
        const result = await pool.query<{ found: boolean }>(
          'SELECT to_regclass($1) IS NOT NULL AS found',
          [table],
        );
        return result.rows[0]?.found === true;
      },
    };
  }

  migratorContract('PgMigrator', fresh);
});
