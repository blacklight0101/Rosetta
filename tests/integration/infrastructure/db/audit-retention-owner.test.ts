import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readMigrationFiles } from '../../../../src/infrastructure/db/migration-files.js';
import { PgMigrator } from '../../../../src/infrastructure/db/pg-migrator.js';
import { createPool, type DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import {
  hasTestDatabase,
  migrationsFolder,
  testClock,
  useTestDatabase,
} from '../../../support/postgres.js';
import { queryAs } from '../../../support/query-as-role.js';

// DEC-132, RF-1109, data-model.md sections 4 and 6: the purge function belongs to the role that
// runs the migrations (rosetta_migrator, the owner of audit_events), so the server role
// rosetta_app may call it but can neither redefine it nor take it over. The migrations run here
// as rosetta_migrator, as they do in the deployment, and the owner is read from the catalogue.

const MIGRATOR = 'rosetta_migrator';
const INSUFFICIENT_PRIVILEGE = '42501';
const SIGNATURE = 'purge_audit_events_before(timestamptz)';

/** The migration role of db/init/roles.sh; created here because migrations never create roles. */
const ENSURE_MIGRATOR_ROLE = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_migrator') THEN
    CREATE ROLE rosetta_migrator NOLOGIN;
  END IF;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$`;

const database = useTestDatabase();
const migratorPools: DatabasePool[] = [];

function ignoreIdleError(): void {
  // An idle connection closing while the test schema is dropped is not a test failure.
}

/** The schema URL with every connection switched to rosetta_migrator at start-up. */
function asMigrator(url: string): string {
  const parsed = new URL(url);
  const options = parsed.searchParams.get('options') ?? '';
  parsed.searchParams.set('options', `${options} -c role=${MIGRATOR}`.trim());
  return parsed.toString();
}

/** A schema owned by rosetta_migrator with every release migration applied by that role. */
async function migratedByMigrator(): Promise<DatabasePool> {
  const { pool, name, url } = await database.createSchema({ migrate: false });
  await pool.query(ENSURE_MIGRATOR_ROLE);
  const owner = await pool.query<{ sql: string }>('SELECT format($1, $2::text, $3::text) AS sql', [
    'ALTER SCHEMA %I OWNER TO %I',
    name,
    MIGRATOR,
  ]);
  await pool.query(owner.rows[0]?.sql ?? '');
  const migrator = createPool({ connectionString: asMigrator(url), onIdleError: ignoreIdleError });
  migratorPools.push(migrator);
  const migrations = await readMigrationFiles(migrationsFolder);
  await new PgMigrator({ pool: migrator, migrations, clock: testClock }).migrate();
  return pool;
}

afterAll(async () => {
  await Promise.all(migratorPools.map((pool) => pool.end()));
});

describe.skipIf(!hasTestDatabase)('audit retention function owner', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedByMigrator();
  });

  it('RF-1109 purge_audit_events_before is owned by rosetta_migrator, the owner of audit_events', async () => {
    const result = await pool.query<{ function_owner: string; table_owner: string }>(
      `SELECT pg_get_userbyid(p.proowner) AS function_owner,
              (SELECT pg_get_userbyid(c.relowner)
                 FROM pg_class c
                WHERE c.relnamespace = n.oid AND c.relname = 'audit_events') AS table_owner
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = current_schema() AND p.proname = 'purge_audit_events_before'`,
    );

    expect(result.rows).toEqual([{ function_owner: MIGRATOR, table_owner: MIGRATOR }]);
  });

  it('RF-1109 rosetta_app cannot ALTER the function', async () => {
    const alter = { sql: `ALTER FUNCTION ${SIGNATURE} SECURITY INVOKER`, params: [] };

    expect(await queryAs(pool, 'rosetta_app', alter)).toEqual({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('RF-1109 rosetta_app cannot replace the function with CREATE OR REPLACE FUNCTION', async () => {
    const replace = {
      sql: `CREATE OR REPLACE FUNCTION purge_audit_events_before(cut_off timestamptz)
              RETURNS bigint LANGUAGE sql AS 'SELECT 0::bigint'`,
      params: [],
    };

    expect(await queryAs(pool, 'rosetta_app', replace)).toEqual({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('RF-1109 rosetta_app cannot change the owner of the function', async () => {
    const takeOver = { sql: `ALTER FUNCTION ${SIGNATURE} OWNER TO rosetta_app`, params: [] };

    expect(await queryAs(pool, 'rosetta_app', takeOver)).toEqual({ code: INSUFFICIENT_PRIVILEGE });
  });
});
