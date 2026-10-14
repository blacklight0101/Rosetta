import { describe, expect, it, vi } from 'vitest';
import { ListProjectOverview } from '../../../src/application/use-cases/list-project-overview.js';
import { PgCostLedger } from '../../../src/infrastructure/db/pg-cost-ledger.js';
import { PgCostTotals } from '../../../src/infrastructure/db/pg-cost-totals.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import { seedProjects } from '../../support/overview-seed.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';

// RF-1008, RF-1105: the Projects overview sends the same number of statements to PostgreSQL for 1,
// 10 and 50 projects, and answers only the signed-in user's rows.

const SEED_TIMEOUT_MS = 60_000;

describe.skipIf(!hasTestDatabase)('ListProjectOverview on PostgreSQL', () => {
  const database = useTestDatabase();

  it(
    'RF-1008 sends the same number of statements for 1, 10 and 50 projects',
    async () => {
      const statements: number[] = [];
      for (const projects of [1, 10, 50]) {
        const { pool } = await database.createSchema({ migrate: true });
        const amy = sampleAccount({ userName: 'amy' });
        const bob = sampleAccount({ userName: 'bob' });
        const users = new PgUserRepository(pool);
        await users.insert(amy);
        await users.insert(bob);
        const stores = { projects: new PgProjectRepository(pool), runs: new PgRunIndex(pool) };
        const ledger = new PgCostLedger(pool);
        const seeded = {
          ...stores,
          addCost: (entry: Parameters<typeof ledger.settle>[0]) => ledger.settle(entry),
        };
        await seedProjects(seeded, amy.id, projects);
        await seedProjects(seeded, bob.id, 3);
        const overview = new ListProjectOverview({ ...stores, costs: new PgCostTotals(pool) });
        const spy = vi.spyOn(pool, 'query');

        const rows = await overview.execute({ actor: { userId: amy.id, role: 'user' } });

        expect(rows).toHaveLength(projects);
        expect(rows.every((row) => row.project.userId === amy.id && row.runs === 2)).toBe(true);
        statements.push(spy.mock.calls.length);
      }
      expect(new Set(statements).size).toBe(1);
    },
    SEED_TIMEOUT_MS,
  );
});
