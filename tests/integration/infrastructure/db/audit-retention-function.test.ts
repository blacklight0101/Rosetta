import { describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { auditEvent, insert } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { queryAs } from '../../../support/query-as-role.js';

// DEC-132, RF-1109, data-model.md sections 4 and 6: the one way to delete audit rows is the
// SECURITY DEFINER function `purge_audit_events_before`. The server role may call it, but it
// refuses any cut-off younger than 365 days on the database clock.

const DAY = 86_400_000;
const FUNCTION = 'purge_audit_events_before';
const INVALID_PARAMETER = '22023';
const PURGE_SQL = `SELECT ${FUNCTION}($1::timestamptz) AS deleted`;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

function purgeBefore(cutOff: Date | null) {
  return { sql: PURGE_SQL, params: [cutOff] };
}

async function withRows(database: ReturnType<typeof useTestDatabase>): Promise<DatabasePool> {
  const { pool } = await database.createSchema({ migrate: true });
  await insert(pool, auditEvent({ at: daysAgo(400), action: 'old' }));
  await insert(pool, auditEvent({ at: daysAgo(364), action: 'young' }));
  return pool;
}

async function actions(pool: DatabasePool): Promise<string[]> {
  const rows = await pool.query<{ action: string }>('SELECT action FROM audit_events');
  return rows.rows.map((row) => row.action).sort();
}

describe.skipIf(!hasTestDatabase)('audit retention function', () => {
  const database = useTestDatabase();

  it('RF-1109 purge_audit_events_before is SECURITY DEFINER with a fixed search_path', async () => {
    const { pool } = await database.createSchema({ migrate: true });

    const result = await pool.query<{ secdef: boolean; config: string[] | null }>(
      `SELECT p.prosecdef AS secdef, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = current_schema() AND p.proname = $1`,
      [FUNCTION],
    );

    expect(result.rows).toEqual([{ secdef: true, config: ['search_path=pg_catalog, pg_temp'] }]);
  });

  it('RF-1109 EXECUTE on the function is revoked from PUBLIC and granted to rosetta_app', async () => {
    const { pool } = await database.createSchema({ migrate: true });

    const result = await pool.query<{ public_may: boolean; app_may: boolean }>(
      `SELECT (p.proacl IS NULL OR EXISTS (SELECT FROM aclexplode(p.proacl) a WHERE a.grantee = 0)) AS public_may,
              has_function_privilege('rosetta_app', p.oid, 'EXECUTE') AS app_may
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = current_schema() AND p.proname = $1`,
      [FUNCTION],
    );

    expect(result.rows).toEqual([{ public_may: false, app_may: true }]);
  });

  it('RF-1109 rosetta_app deletes the rows older than the cut-off through the function and no others', async () => {
    const pool = await withRows(database);

    const outcome = await queryAs(
      pool,
      'rosetta_app',
      purgeBefore(daysAgo(366)),
      `SELECT action FROM audit_events`,
    );

    expect(outcome).toEqual({ rows: [{ action: 'young' }] });
  });

  it('RF-1109 the function returns how many rows it deleted', async () => {
    const pool = await withRows(database);
    const rows = await pool.query<{ deleted: string }>(PURGE_SQL, [daysAgo(366)]);

    expect(rows.rows).toEqual([{ deleted: '1' }]);
    expect(await actions(pool)).toEqual(['young']);
  });

  it('RF-1109 the function refuses a cut-off younger than 365 days and deletes nothing', async () => {
    const pool = await withRows(database);

    const outcome = await queryAs(pool, 'rosetta_app', purgeBefore(daysAgo(364)));

    expect(outcome).toEqual({ code: INVALID_PARAMETER });
    expect(await actions(pool)).toEqual(['old', 'young']);
  });

  it('RF-1109 the function refuses a cut-off of now and a null cut-off', async () => {
    const pool = await withRows(database);

    expect(await queryAs(pool, 'rosetta_app', purgeBefore(new Date()))).toEqual({
      code: INVALID_PARAMETER,
    });
    expect(await queryAs(pool, 'rosetta_app', purgeBefore(null))).toEqual({
      code: INVALID_PARAMETER,
    });
  });

  it('RF-1109 the floor is 365 days on the database clock: one minute either side of it', async () => {
    const pool = await withRows(database);
    const edge = Date.now() - 365 * DAY;

    expect(await queryAs(pool, 'rosetta_app', purgeBefore(new Date(edge + 60_000)))).toEqual({
      code: INVALID_PARAMETER,
    });
    expect(await queryAs(pool, 'rosetta_app', purgeBefore(new Date(edge - 60_000)))).toMatchObject({
      rows: [{ ok: 1 }],
    });
  });

  it('RF-1109 a caller whose clock runs two days ahead gets no younger floor', async () => {
    const pool = await withRows(database);
    const callerNow = Date.now() + 2 * DAY;

    const outcome = await queryAs(
      pool,
      'rosetta_app',
      purgeBefore(new Date(callerNow - 365 * DAY)),
    );

    expect(outcome).toEqual({ code: INVALID_PARAMETER });
  });

  it('RF-1109 a temporary table named audit_events does not take the place of the real one', async () => {
    const pool = await withRows(database);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('role', 'rosetta_app', true)");
      await client.query('CREATE TEMP TABLE audit_events (at timestamptz) ON COMMIT DROP');
      await client.query(PURGE_SQL, [daysAgo(366)]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(await actions(pool)).toEqual(['young']);
  });
});
