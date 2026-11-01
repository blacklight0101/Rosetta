import { describe, expect, it } from 'vitest';
import { stepAmountOf } from '../../../../src/application/journey/journey-budget.js';
import { PgJourneyRecords } from '../../../../src/infrastructure/db/pg-journey-records.js';
import { PgProjectRepository } from '../../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-011, RF-435, RF-1105, ADR-016, ADR-027: PgJourneyRecords on the disposable PostgreSQL, one
// migrated schema per test: one journey per project, read only by its owner, replaced by a new
// Analyse; and the spend of the steps checked against the one approved amount.
const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b1';
const project = '00000000-0000-4000-a000-0000000000a1';
const approved = { tokens: 1_000_000, costMicros: 500_000 };

type Database = ReturnType<typeof useTestDatabase>;

async function freshOf(database: Database) {
  const { pool } = await database.createSchema({ migrate: true });
  const users = new PgUserRepository(pool);
  await users.insert(sampleAccount({ id: amy, userName: 'amy' }));
  await users.insert(sampleAccount({ id: bob, userName: 'bob' }));
  await new PgProjectRepository(pool).insertOrFind(sampleProject({ id: project, userId: amy }));
  return { journeys: new PgJourneyRecords(pool), runs: new PgRunIndex(pool) };
}

describe.skipIf(!hasTestDatabase)('PgJourneyRecords', () => {
  const database = useTestDatabase();
  const fresh = () => freshOf(database);

  it('RF-011 a project with no journey has none', async () => {
    const { journeys } = await fresh();

    expect(await journeys.find(amy, project)).toBeUndefined();
  });

  it('RF-011 a saved journey comes back with its amount and time', async () => {
    const { journeys } = await fresh();

    await journeys.save({ userId: amy, projectId: project, approved, createdAt: 5_000_000_000 });

    expect(await journeys.find(amy, project)).toEqual({
      ...{ userId: amy, projectId: project, approved, createdAt: 5_000_000_000 },
    });
  });

  it("RF-1105 another user's read finds nothing and cannot save over the journey", async () => {
    const { journeys } = await fresh();
    await journeys.save({ userId: amy, projectId: project, approved, createdAt: 1_000 });

    expect(await journeys.find(bob, project)).toBeUndefined();
    await expect(
      journeys.save({
        userId: bob,
        projectId: project,
        approved: { tokens: 1, costMicros: 1 },
        createdAt: 2_000,
      }),
    ).rejects.toMatchObject({ code: 'RST-2003' });
    expect((await journeys.find(amy, project))?.approved).toEqual(approved);
  });

  it('RF-434 a new Analyse replaces the journey of the project', async () => {
    const { journeys } = await fresh();
    await journeys.save({ userId: amy, projectId: project, approved, createdAt: 1_000 });

    const next = { tokens: 7, costMicros: 3 };
    await journeys.save({ userId: amy, projectId: project, approved: next, createdAt: 9_000 });

    expect(await journeys.find(amy, project)).toMatchObject({ approved: next, createdAt: 9_000 });
  });
});

describe.skipIf(!hasTestDatabase)('the spend of a journey on PostgreSQL', () => {
  const database = useTestDatabase();
  const fresh = () => freshOf(database);

  it('RF-435 the spend of the steps is checked against the one approved amount', async () => {
    const { journeys, runs } = await fresh();
    const at = Date.now();
    await journeys.save({ userId: amy, projectId: project, approved, createdAt: at });
    const run = (
      stage: 'understand' | 'scan' | 'plan',
      queuedAt: number,
      tokens: number,
      cost: number,
    ) =>
      runs.insert(
        sampleRun({
          ...{ userId: amy, projectId: project, stage, queuedAt },
          totals: { costMicros: cost, inputTokens: tokens, outputTokens: 0, cachedInputTokens: 0 },
        }),
      );
    await run('understand', at - 10_000, 900_000, 400_000); // before the journey
    await run('scan', at + 1_000, 900_000, 400_000); // a scan is free and not a step
    await run('understand', at + 2_000, 300_000, 120_000);
    await run('plan', at + 3_000, 200_000, 80_000);

    const left = await stepAmountOf({ journeys, runs }, { userId: amy, projectId: project });

    expect(left).toEqual({ tokens: 500_000, costMicros: 300_000 });
  });

  it('RF-435 a project with no journey has no line to run under', async () => {
    const { journeys, runs } = await fresh();

    expect(
      await stepAmountOf({ journeys, runs }, { userId: amy, projectId: project }),
    ).toBeUndefined();
  });
});
