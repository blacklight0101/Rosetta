import { describe } from 'vitest';
import { PgAccountUsage } from '../../../../src/infrastructure/db/pg-account-usage.js';
import { accountUsageContract } from '../../../contracts/account-usage.contract.js';
import { ledgerRow, project, user, newId } from '../../../support/db-rows.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';

// Architecture section 7, ADR-016: PgAccountUsage passes the AccountUsage contract on the
// disposable PostgreSQL, one migrated schema per test, over real `projects` and `cost_ledger` rows.
describe.skipIf(!hasTestDatabase)('PgAccountUsage', () => {
  const database = useTestDatabase();

  accountUsageContract('PgAccountUsage', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    const insert = async (row: { sql: string; params: unknown[] }): Promise<void> => {
      await pool.query(row.sql, row.params);
    };
    return {
      usage: new PgAccountUsage(pool),
      addUser: async () => {
        const id = newId();
        await insert(user({ id }));
        return id;
      },
      addProject: (userId) => insert(project(userId)),
      addCost: (userId, row) =>
        insert(
          ledgerRow(userId, {
            at: row.at,
            cost_micros: row.costMicros.toString(),
            currency: row.currency ?? 'USD',
            key_source: row.keySource ?? 'server',
          }),
        ),
    };
  });
});
