import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { appendOnlyTables, readWriteTables } from './expected-schema.js';
import { auditEvent, insert, ledgerRow, outcomeOf, user } from './rows.js';

const INSUFFICIENT_PRIVILEGE = '42501';
const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const;

const database = useTestDatabase();
const ownerId = randomUUID();
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

  it('RF-1302 rosetta_app cannot change the schema', async () => {
    const ddl = { sql: 'ALTER TABLE users ADD COLUMN extra text', params: [] };

    expect(await outcomeOf(pool, ddl, 'rosetta_app')).toBe(INSUFFICIENT_PRIVILEGE);
  });
});
