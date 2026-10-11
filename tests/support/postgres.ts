import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';
import { readMigrationFiles } from '../../src/infrastructure/db/migration-files.js';
import { PgMigrator } from '../../src/infrastructure/db/pg-migrator.js';
import { createPool, type DatabasePool } from '../../src/infrastructure/db/pool.js';
import { FixedClock } from './fixed-clock.js';

// Database integration tests (data-model.md section 8, DEC-112): the PostgreSQL at
// ROSETTA_TEST_DATABASE_URL (the CI service container or the Compose `db` service), a schema of
// its own for each test file, every release migration applied. Without the variable the suites
// are skipped and reported as skipped.

const testDatabaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'] ?? '';

/** False when ROSETTA_TEST_DATABASE_URL is empty: use with `describe.skipIf(!hasTestDatabase)`. */
export const hasTestDatabase = testDatabaseUrl !== '';

/** The release migrations shipped in `db/migrations/`. */
export const migrationsFolder = fileURLToPath(new URL('../../db/migrations/', import.meta.url));

/** A fixed instant for `schema_version.applied_at`. */
export const testClock = new FixedClock('2026-10-11T09:00:00.000Z');

interface TestSchema {
  /** A pool whose connections use this schema (search_path). */
  readonly pool: DatabasePool;
  /** The schema name, unique per call. */
  readonly name: string;
  /** A connection URL whose connections use this schema, for code that builds its own pool. */
  readonly url: string;
}

export interface TestDatabase {
  /** Creates an empty schema, or one with every release migration applied. */
  createSchema(options: { readonly migrate: boolean }): Promise<TestSchema>;
}

/** The role the release migrations grant to; created here because migrations never create roles. */
const ENSURE_APP_ROLE = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app') THEN
    CREATE ROLE rosetta_app NOLOGIN;
  END IF;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$`;

function ignoreIdleError(): void {
  // An idle connection closing while a test schema is dropped is not a test failure.
}

function schemaUrl(schema: string): string {
  const url = new URL(testDatabaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return url.toString();
}

/** Runs one statement that the server builds with `format()` from a fixed template and a name. */
async function runFormatted(pool: DatabasePool, template: string, name: string): Promise<void> {
  const formatted = await pool.query<{ sql: string }>('SELECT format($1, $2::text) AS sql', [
    template,
    name,
  ]);
  const sql = formatted.rows[0]?.sql;
  if (sql === undefined) throw new Error('format() returned no statement');
  await pool.query(sql);
}

/** Applies every release migration in `db/migrations/` to the schema of `pool`. */
async function applyReleaseMigrations(pool: DatabasePool): Promise<void> {
  const migrations = await readMigrationFiles(migrationsFolder);
  await new PgMigrator({ pool, migrations, clock: testClock }).migrate();
}

/**
 * Registers an `afterAll` hook that drops every schema this test file created and closes its
 * pools. Call `createSchema` inside `beforeAll` or a test.
 */
export function useTestDatabase(): TestDatabase {
  const schemas: TestSchema[] = [];
  let admin: DatabasePool | undefined;

  afterAll(async () => {
    await Promise.all(schemas.map((schema) => schema.pool.end()));
    if (admin === undefined) return;
    for (const schema of schemas) {
      await runFormatted(admin, 'DROP SCHEMA IF EXISTS %I CASCADE', schema.name);
    }
    await admin.end();
  });

  return {
    async createSchema(options) {
      admin ??= createPool({ connectionString: testDatabaseUrl, onIdleError: ignoreIdleError });
      const name = `rst_test_${randomBytes(6).toString('hex')}`;
      await admin.query(ENSURE_APP_ROLE);
      await runFormatted(admin, 'CREATE SCHEMA %I', name);
      await runFormatted(admin, 'GRANT USAGE ON SCHEMA %I TO rosetta_app', name);
      const url = schemaUrl(name);
      const pool = createPool({ connectionString: url, onIdleError: ignoreIdleError });
      schemas.push({ pool, name, url });
      if (options.migrate) await applyReleaseMigrations(pool);
      return { pool, name, url };
    },
  };
}
