import { createPool } from '../../../src/infrastructure/db/pool.js';
import { disposableSchemaUrl } from './database.js';
import { e2ePort } from './server-config.js';

// RF-435, RF-432, P8-03: the amount a journey was approved at, and the tokens a run spent, read and
// set in the database of the end-to-end server. The recorded run spends far less than any estimate
// the server can make, so the journey is approved so that 110% of that real spend is left (a row the Analyse
// button would write if its estimate were that low); the next step then runs a real call under what
// is left. Nothing in the product is overridden.

async function withPool<T>(use: (query: ReturnType<typeof createPool>) => Promise<T>): Promise<T> {
  const pool = createPool({
    connectionString: disposableSchemaUrl(
      process.env['ROSETTA_TEST_DATABASE_URL'] ?? '',
      e2ePort(),
    ),
    onIdleError: () => undefined,
  });
  try {
    return await use(pool);
  } finally {
    await pool.end();
  }
}

/** The tokens (input and output) the run of this UUID used. */
export function spentTokensOf(runUuid: string): Promise<number> {
  return withPool(async (pool) => {
    const found = await pool.query<{ spent: string }>(
      'SELECT (input_tokens + output_tokens)::text AS spent FROM runs WHERE id = $1',
      [runUuid],
    );
    return Number(found.rows[0]?.spent ?? Number.NaN);
  });
}

/** Approves the journey of the run's project at `tokens` and `costMicros` (the Analyse row). */
export function approveJourneyAt(
  runUuid: string,
  amount: { readonly tokens: number; readonly costMicros: number },
): Promise<number> {
  return withPool(async (pool) => {
    const updated = await pool.query(
      `UPDATE journeys SET approved_tokens = $2, approved_cost_micros = $3
         WHERE project_id = (SELECT project_id FROM runs WHERE id = $1)`,
      [runUuid, amount.tokens, amount.costMicros],
    );
    return updated.rowCount ?? 0;
  });
}

/** The project id of the run of this UUID. */
export function projectOf(runUuid: string): Promise<string> {
  return withPool(async (pool) => {
    const found = await pool.query<{ project_id: string }>(
      'SELECT project_id FROM runs WHERE id = $1',
      [runUuid],
    );
    return found.rows[0]?.project_id ?? '';
  });
}
