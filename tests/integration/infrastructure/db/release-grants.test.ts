import { beforeAll, describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { appendOnlyTables, readWriteTables } from './expected-schema.js';
import { auditEvent, insert, ledgerRow, newId, outcomeOf, user } from '../../../support/db-rows.js';

const INSUFFICIENT_PRIVILEGE = '42501';
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const;

const database = useTestDatabase();
const ownerId = newId();
let ready: Promise<DatabasePool> | undefined;

/** One migrated schema for the file, with a user, a ledger row and an audit event. */
function migratedSchema(): Promise<DatabasePool> {
  ready ??= (async () => {
    const { pool } = await database.createSchema({ migrate: true });
    await insert(pool, user({ id: ownerId }));
    await insert(pool, ledgerRow(ownerId));
    await insert(pool, auditEvent());
    return pool;
  })();
  return ready;
}

async function privilegesOf(pool: DatabasePool, table: string): Promise<string[]> {
  const granted: string[] = [];
  for (const privilege of PRIVILEGES) {
    const result = await pool.query<{ granted: boolean }>(
      'SELECT has_table_privilege($1, $2, $3) AS granted',
      ['rosetta_app', table, privilege],
    );
    if (result.rows[0]?.granted === true) granted.push(privilege);
  }
  return granted;
}

describe.skipIf(!hasTestDatabase)('release-1 grants', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedSchema();
  });

  it.each(readWriteTables)(
    'RF-1302 rosetta_app may select, insert, update and delete %s',
    async (table) => {
      expect(await privilegesOf(pool, table)).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
    },
  );

  it.each(appendOnlyTables)('RF-1302 rosetta_app may only select and insert %s', async (table) => {
    expect(await privilegesOf(pool, table)).toEqual(['SELECT', 'INSERT']);
  });

  it('RF-1302 rosetta_app has no right on schema_version', async () => {
    expect(await privilegesOf(pool, 'schema_version')).toEqual([]);
  });
});

describe.skipIf(!hasTestDatabase)('release-1 grants in use', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedSchema();
  });

  it('RF-1302 rosetta_app can insert a cost_ledger row', async () => {
    expect(await outcomeOf(pool, ledgerRow(ownerId), 'rosetta_app')).toBe('ok');
  });

  it('RF-1302 rosetta_app cannot UPDATE cost_ledger', async () => {
    const update = { sql: 'UPDATE cost_ledger SET cost_micros = $1', params: [0] };

    expect(await outcomeOf(pool, update, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('RF-1302 rosetta_app cannot DELETE from cost_ledger or audit_events', async () => {
    const ledger = { sql: 'DELETE FROM cost_ledger WHERE user_id = $1', params: [ownerId] };
    const audit = { sql: 'DELETE FROM audit_events WHERE outcome = $1', params: ['ok'] };

    expect(await outcomeOf(pool, ledger, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await outcomeOf(pool, audit, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('RF-1109 rosetta_app cannot UPDATE audit_events, and only the retention function deletes rows', async () => {
    const update = { sql: 'UPDATE audit_events SET outcome = $1', params: ['ok'] };

    expect(await outcomeOf(pool, update, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await privilegesOf(pool, 'audit_events')).toEqual(['SELECT', 'INSERT']);
  });

  it('RF-1302 rosetta_app cannot change the schema', async () => {
    const ddl = { sql: 'ALTER TABLE users ADD COLUMN extra text', params: [] };

    expect(await outcomeOf(pool, ddl, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe.skipIf(!hasTestDatabase)('release-1 grants: no CREATE', () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = await migratedSchema();
  });

  it.each([
    ['a table in public', 'CREATE TABLE public.rst_probe (a int)'],
    ['a table in public, quoted and upper case', 'CREATE TABLE "public"."RST_PROBE" (a int)'],
    ['a table in the current schema', 'CREATE TABLE rst_probe (a int)'],
    ['a view in public', 'CREATE VIEW public.rst_probe AS SELECT 1 AS a'],
    [
      'a function in public',
      'CREATE FUNCTION public.rst_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$',
    ],
    ['a type in public', "CREATE TYPE public.rst_probe AS ENUM ('a')"],
    ['a sequence in public', 'CREATE SEQUENCE public.rst_probe'],
    ['a schema', 'CREATE SCHEMA rst_probe'],
  ])('RF-1302 rosetta_app cannot CREATE %s', async (_label, sql) => {
    expect(await outcomeOf(pool, { sql, params: [] }, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('RF-1302 rosetta_app holds no CREATE right on public, on its own schema or on the database', async () => {
    const rights = await pool.query<{ schema: boolean; current: boolean; database: boolean }>(
      `SELECT has_schema_privilege('rosetta_app', 'public', 'CREATE') AS schema,
              has_schema_privilege('rosetta_app', current_schema(), 'CREATE') AS current,
              has_database_privilege('rosetta_app', current_database(), 'CREATE') AS database`,
    );

    expect(rights.rows).toEqual([{ schema: false, current: false, database: false }]);
  });

  it('RF-1302 rosetta_app is not a superuser and cannot create roles or databases or bypass row security', async () => {
    const role = await pool.query<Record<string, boolean>>(
      'SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname = $1',
      ['rosetta_app'],
    );

    expect(role.rows).toEqual([
      { rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false },
    ]);
  });
});
