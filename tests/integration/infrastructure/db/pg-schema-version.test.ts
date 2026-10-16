import { afterAll, describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { PgSchemaVersion } from '../../../../src/infrastructure/db/pg-schema-version.js';
import { createPool, type DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { hasTestDatabase, migrationsFolder, useTestDatabase } from '../../../support/postgres.js';
import { asRole } from '../../../support/role-url.js';

// RF-1302, DEC-140 (P1-158; P1-49 F-02, F-19): what the server reads at start-up with its own
// credential. rosetta_app may read schema_version (migration 0010) and nothing else on it; a
// schema the migrate step has not reached reads as "nothing recorded"; the server can tell when
// DATABASE_URL connects as the role that owns the audit and ledger tables.

const database = useTestDatabase();
const pools: DatabasePool[] = [];

function ignoreIdleError(): void {
  // An idle connection closing while the test schema is dropped is not a test failure.
}

function poolAs(url: string, role: string): DatabasePool {
  const pool = createPool({ connectionString: asRole(url, role), onIdleError: ignoreIdleError });
  pools.push(pool);
  return pool;
}

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
});

describe.skipIf(!hasTestDatabase)('schema version read by the server', () => {
  it('RF-1302 rosetta_app reads every applied migration of a migrated schema', async () => {
    const { url } = await database.createSchema({ migrate: true });
    const shipped = await readMigrationFiles(migrationsFolder);

    const recorded = await new PgSchemaVersion(poolAs(url, 'rosetta_app')).recorded();

    expect(recorded?.map((row) => row.version)).toEqual(shipped.map((file) => file.version));
    expect(recorded?.map((row) => row.checksum)).toEqual(shipped.map((file) => file.checksum));
  });

  it('RF-1302 an empty schema, without schema_version, reads as nothing recorded', async () => {
    const { url } = await database.createSchema({ migrate: false });

    expect(await new PgSchemaVersion(poolAs(url, 'rosetta_app')).recorded()).toBeUndefined();
  });

  it('RF-1302 a schema_version rosetta_app may not read (before 0010) reads as nothing recorded', async () => {
    const { pool, url } = await database.createSchema({ migrate: true });
    await pool.query('REVOKE SELECT ON schema_version FROM rosetta_app');

    expect(await new PgSchemaVersion(poolAs(url, 'rosetta_app')).recorded()).toBeUndefined();
  });
});

describe.skipIf(!hasTestDatabase)('schema owner check', () => {
  it('RF-1302 rosetta_app does not own the schema', async () => {
    const { url } = await database.createSchema({ migrate: true });

    expect(await new PgSchemaVersion(poolAs(url, 'rosetta_app')).connectsAsOwner()).toBe(false);
  });

  it('RF-1302 F-19 the role that ran the migrations (it owns audit_events) is the owner', async () => {
    const { pool } = await database.createSchema({ migrate: true });

    expect(await new PgSchemaVersion(pool).connectsAsOwner()).toBe(true);
  });
});
