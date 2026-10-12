import { describe, expect, it } from 'vitest';
import type { DatabasePool } from '../../../../src/infrastructure/db/pool.js';
import { PgCostLedger } from '../../../../src/infrastructure/db/pg-cost-ledger.js';
import {
  costLedgerContract,
  entryOf,
  ledgerNow,
  reservationOf,
} from '../../../contracts/cost-ledger.contract.js';
import { newId, user } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016, RF-1106, DEC-112: PgCostLedger on the disposable PostgreSQL.
// The caps are checked and the reservation inserted in one transaction under advisory locks on the
// user and the server, so parallel runs cannot both pass the last free cent; the ledger rows of a
// run outlive an interrupted run.
describe.skipIf(!hasTestDatabase)('PgCostLedger', () => {
  const database = useTestDatabase();

  async function addUser(pool: DatabasePool): Promise<string> {
    const id = newId();
    const row = user({ id });
    await pool.query(row.sql, row.params);
    return id;
  }

  costLedgerContract('PgCostLedger', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    return { ledger: new PgCostLedger(pool), addUser: () => addUser(pool), newRunId: newId };
  });

  it('RF-1106 two parallel runs racing for the last cent: exactly one call is reserved', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const ledger = new PgCostLedger(pool);
    const userId = await addUser(pool);
    const caps = [{ kind: 'user-day', limit: 1_000n }] as const;
    const racers = Array.from({ length: 8 }, () =>
      reservationOf({ userId, runId: newId() }, { worstCase: { micros: 600n, tokens: 0n } }),
    );

    const results = await Promise.all(
      racers.map((reservation) => ledger.reserve({ reservation, caps, at: ledgerNow })),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it('RF-1106 parallel users of the server keys never pass the server month together', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const ledger = new PgCostLedger(pool);
    const users = await Promise.all(Array.from({ length: 6 }, () => addUser(pool)));
    const caps = [{ kind: 'server-month', limit: 1_000n }] as const;

    const results = await Promise.all(
      users.map((userId) =>
        ledger.reserve({
          reservation: reservationOf(
            { userId, runId: newId() },
            { worstCase: { micros: 400n, tokens: 0n } },
          ),
          caps,
          at: ledgerNow,
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(2);
  });

  it('RF-428 an interrupted run keeps its ledger rows; its open reservation only expires', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const ledger = new PgCostLedger(pool);
    const ids = { userId: await addUser(pool), runId: newId() };
    const settled = reservationOf(ids);
    const open = reservationOf(ids);
    await ledger.reserve({ reservation: settled, caps: [], at: ledgerNow });
    await ledger.settle(entryOf(settled));
    await ledger.reserve({ reservation: open, caps: [], at: ledgerNow });

    const restarted = new PgCostLedger(pool);

    expect(await restarted.runEntries(ids.userId, ids.runId)).toEqual([entryOf(settled)]);
    expect(await restarted.purgeExpired(new Date('2026-10-12T11:00:00.000Z'))).toBe(1);
    expect(await restarted.runEntries(ids.userId, ids.runId)).toEqual([entryOf(settled)]);
  });

  it('RF-428 rosetta_app may only insert and read ledger rows', async () => {
    const { pool } = await database.createSchema({ migrate: true });

    const grants = await pool.query<{ privilege_type: string }>(
      "SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee = 'rosetta_app' AND table_name = 'cost_ledger' AND table_schema = current_schema() ORDER BY privilege_type",
    );

    expect(grants.rows.map((row) => row.privilege_type)).toEqual(['INSERT', 'SELECT']);
  });
});
