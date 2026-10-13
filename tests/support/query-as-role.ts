import type { DatabasePool } from '../../src/infrastructure/db/pool.js';

/**
 * Runs one statement as `role` inside a transaction that is always rolled back, then runs the
 * `after` statement in the same transaction. Returns the rows of `after`, or the SQLSTATE when the
 * first statement failed.
 */
export async function queryAs(
  pool: DatabasePool,
  role: string,
  statement: { readonly sql: string; readonly params: unknown[] },
  after = 'SELECT 1 AS ok',
): Promise<{ readonly rows: Record<string, unknown>[] } | { readonly code: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['role', role]);
    try {
      await client.query(statement.sql, statement.params);
    } catch (error) {
      if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
        return { code: error.code };
      }
      throw error;
    }
    return { rows: (await client.query<Record<string, unknown>>(after)).rows };
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
