import { describe } from 'vitest';
import { PgCostLedger } from '../../../../src/infrastructure/db/pg-cost-ledger.js';
import { PgCostTotals } from '../../../../src/infrastructure/db/pg-cost-totals.js';
import { costTotalsContract } from '../../../contracts/cost-totals.contract.js';
import { newId, user } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016: PgCostTotals passes the CostTotals contract on the disposable
// PostgreSQL, one migrated schema per test, over `cost_ledger` rows the budget guard's adapter writes.
describe.skipIf(!hasTestDatabase)('PgCostTotals', () => {
  const database = useTestDatabase();

  costTotalsContract('PgCostTotals', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const ledger = new PgCostLedger(pool);
    return {
      totals: new PgCostTotals(pool),
      addUser: async () => {
        const id = newId();
        const row = user({ id });
        await pool.query(row.sql, row.params);
        return id;
      },
      add: (entry) => ledger.settle(entry),
    };
  });
});
