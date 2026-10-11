import { beforeAll, describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { PgMigrator } from '../../../../src/infrastructure/db/pg-migrator.js';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import {
  hasTestDatabase,
  migrationsFolder,
  testClock,
  useTestDatabase,
} from '../../../support/postgres.js';

interface VersionRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

async function recorded(pool: DatabasePool): Promise<VersionRow[]> {
  const result = await pool.query<VersionRow>(
    'SELECT version, name, checksum, applied_at FROM schema_version ORDER BY version',
  );
  return result.rows;
}

describe.skipIf(!hasTestDatabase)('release-1 migrations', () => {
  const database = useTestDatabase();
  let pool: DatabasePool;

  beforeAll(async () => {
    ({ pool } = await database.createSchema({ migrate: false }));
  });

  it('RF-1302 applies every release migration to an empty database and records it', async () => {
    const migrations = await readMigrationFiles(migrationsFolder);

    const applied = await new PgMigrator({ pool, migrations, clock: testClock }).migrate();

    expect(applied.map((migration) => migration.version)).toEqual([1, 2, 3, 4]);
    expect(await recorded(pool)).toEqual(
      migrations.map((migration) => ({
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        applied_at: testClock.now(),
      })),
    );
  });

  it('RF-1302 a second run on the migrated database changes nothing', async () => {
    const migrations = await readMigrationFiles(migrationsFolder);
    const before = await recorded(pool);

    const applied = await new PgMigrator({ pool, migrations, clock: testClock }).migrate();

    expect(applied).toEqual([]);
    expect(await recorded(pool)).toEqual(before);
  });

  it('RF-1106 0004 inserts the default server caps, queue limit and empty default roles', async () => {
    const result = await pool.query<{ key: string; value: unknown; updated_by: string | null }>(
      'SELECT key, value, updated_by FROM server_settings ORDER BY key',
    );

    expect(result.rows).toEqual([
      {
        key: 'caps',
        value: { runMicros: 500_000, userDayMicros: 1_000_000, serverMonthMicros: 10_000_000 },
        updated_by: null,
      },
      { key: 'defaultRoles', value: {}, updated_by: null },
      { key: 'queue', value: { maxRunning: 2 }, updated_by: null },
    ]);
  });
});
