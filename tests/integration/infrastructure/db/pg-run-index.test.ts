import { describe, expect, it } from 'vitest';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { runIndexOverviewContract } from '../../../contracts/run-index-overview.contract.js';
import {
  amyProject,
  amySecondProject,
  bobProject,
  runAmy,
  runBob,
  runIndexContract,
} from '../../../contracts/run-index.contract.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// Architecture section 7, ADR-016, RF-1108: PgRunIndex passes the RunIndex contract on the
// disposable PostgreSQL, one migrated schema per test.
describe.skipIf(!hasTestDatabase)('PgRunIndex', () => {
  const database = useTestDatabase();

  async function freshIndex(): Promise<PgRunIndex> {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    await users.insert(sampleAccount({ id: runAmy, userName: 'amy' }));
    await users.insert(sampleAccount({ id: runBob, userName: 'bob' }));
    const projects = new PgProjectRepository(pool);
    for (const [id, userId] of [
      [amyProject, runAmy],
      [amySecondProject, runAmy],
      [bobProject, runBob],
    ] as const) {
      await projects.insertOrFind(sampleProject({ id, userId }));
    }
    return new PgRunIndex(pool);
  }

  runIndexContract('PgRunIndex', freshIndex);
  runIndexOverviewContract('PgRunIndex', freshIndex);

  it('RF-003 the totals of a run come back as numbers, also past 32 bits', async () => {
    const index = await freshIndex();
    const run = sampleRun({ userId: runAmy, projectId: amyProject });
    await index.insert(run);
    const totals = {
      costMicros: 5_000_000_000,
      inputTokens: 4_000_000_000,
      outputTokens: 1,
      cachedInputTokens: 2,
    };

    await index.recordTotals(run.id, totals);

    expect((await index.find(runAmy, run.id))?.totals).toEqual(totals);
  });

  it('RF-1105 a run cannot be stored for a project of another user', async () => {
    const index = await freshIndex();

    await expect(
      index.insert(sampleRun({ userId: runBob, projectId: amyProject })),
    ).rejects.toThrow();
  });
});
