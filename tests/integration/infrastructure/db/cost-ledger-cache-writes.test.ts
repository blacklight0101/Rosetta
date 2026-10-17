import { describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { PgCostLedger } from '../../../../src/infrastructure/db/pg-cost-ledger.js';
import { ledgerRow, newId, outcomeOf, user, type Insert } from '../../../support/db-rows.js';
import { entryOf, ledgerNow, reservationOf } from '../../../support/ledger-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// RF-428, ADR-016, data-model.md section 4 (`cost_ledger`), P2-16: migration 0017 gives each ledger
// row the tokens the call wrote to the provider's prompt cache and their cost, fixed at call time.
// Rows written before it read zero; negative values are refused.

const CHECK_VIOLATION = '23514';

async function addUser(pool: DatabasePool): Promise<string> {
  const row = user();
  await pool.query(row.sql, row.params);
  const id = row.params[0];
  if (typeof id !== 'string') throw new Error('The user row has no id');
  return id;
}

/** A ledger row with the cache-write columns set. */
function cacheWriteRow(userId: string, tokens: number, micros: number): Insert {
  const base = ledgerRow(userId);
  return {
    sql: base.sql
      .replace(
        'price_table_version)',
        'price_table_version, cache_write_input_tokens, cache_write_cost_micros)',
      )
      .replace('$18)', '$18, $19, $20)'),
    params: [...base.params, tokens, micros],
  };
}

describe.skipIf(!hasTestDatabase)('cost_ledger cache writes', () => {
  const database = useTestDatabase();

  it('RF-428 PgCostLedger keeps the cache-write tokens and cost of a row', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const ledger = new PgCostLedger(pool);
    const ids = { userId: await addUser(pool), runId: newId() };
    const reservation = reservationOf(ids);
    const entry = entryOf(reservation, {
      cachedInputTokens: 0,
      cacheWriteInputTokens: 1024,
      costMicros: 5568n,
      cacheWriteCostMicros: 3840n,
    });
    await ledger.reserve({ reservation, caps: [], at: ledgerNow });

    await ledger.settle(entry);

    expect(await ledger.runEntries(ids.userId, ids.runId)).toEqual([entry]);
  });

  it('RF-428 a row written without the cache-write columns reads zero for both', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const userId = await addUser(pool);
    const row = ledgerRow(userId);
    await pool.query(row.sql, row.params);

    const read = await pool.query<{ tokens: string; micros: string }>(
      'SELECT cache_write_input_tokens::text AS tokens, cache_write_cost_micros::text AS micros FROM cost_ledger WHERE user_id = $1',
      [userId],
    );

    expect(read.rows).toEqual([{ tokens: '0', micros: '0' }]);
  });

  it.each([
    ['negative cache-write tokens', -1, 0],
    ['a negative cache-write cost', 0, -1],
  ])('RF-1302 refuses %s', async (_name, tokens, micros) => {
    const { pool } = await database.createSchema({ migrate: true });
    const userId = await addUser(pool);

    expect(await outcomeOf(pool, cacheWriteRow(userId, tokens, micros))).toBe(CHECK_VIOLATION);
    expect(await outcomeOf(pool, cacheWriteRow(userId, 1, 1))).toBe('ok');
  });
});
