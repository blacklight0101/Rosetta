import { describe, expect, it } from 'vitest';
import type { Actor } from '../../../src/domain/accounts/actor.js';
import { DeleteProject } from '../../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../../src/application/use-cases/delete-run.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { PgCostLedger } from '../../../src/infrastructure/db/pg-cost-ledger.js';
import { PgCostTotals } from '../../../src/infrastructure/db/pg-cost-totals.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { SecretMasker } from '../../../src/infrastructure/guards/secret-masker.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { entryOf, reservationOf } from '../../support/ledger-fixtures.js';
import { MemoryLogger } from '../../support/memory-logger.js';
import { MemoryWorkspaceFolders } from '../../support/memory-workspace-folders.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { sampleRun } from '../../support/run-fixtures.js';

// RF-1012, DEC-55, data-model.md section 9: deleting a run or a project on PostgreSQL removes the
// run rows and the folders and never a `cost_ledger` row, so the totals of RF-1010 still include
// the calls of the deleted runs. The use cases run over the real adapters of the database.

const amy = '00000000-0000-4000-9000-0000000000a1';
const actor: Actor = { userId: amy, role: 'user' };

async function setup(database: ReturnType<typeof useTestDatabase>) {
  const { pool } = await database.createSchema({ migrate: true });
  await new PgUserRepository(pool).insert(sampleAccount({ id: amy, userName: 'amy' }));
  const projects = new PgProjectRepository(pool);
  const runs = new PgRunIndex(pool);
  const project = sampleProject({ userId: amy });
  await projects.insertOrFind(project);
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const deps = {
    folders: new MemoryWorkspaceFolders(),
    logger: new MemoryLogger(clock, new SecretMasker()),
  };
  const ledger = new PgCostLedger(pool);
  const spend = async (run: Run, cost: bigint): Promise<void> => {
    const call = reservationOf({ userId: amy, runId: run.id });
    await ledger.settle(entryOf(call, { projectId: project.id, costMicros: cost }));
  };
  const ended = async (): Promise<Run> => {
    const run = sampleRun({
      ...{ userId: amy, projectId: project.id, queueState: 'Ended', endState: 'Completed' },
      ...{ startedAt: 1, endedAt: 2 },
    });
    await runs.insert(run);
    return run;
  };
  const count = 'SELECT count(*)::text AS n FROM cost_ledger';
  const ledgerRows = async (): Promise<number> =>
    Number((await pool.query<{ n: string }>(count)).rows[0]?.n);
  const totals = new PgCostTotals(pool);
  const spent = async (): Promise<bigint> =>
    (await totals.userSummary(amy)).reduce((sum, group) => sum + group.costMicros, 0n);
  return { projects, runs, project, ...deps, spend, ended, ledgerRows, totals, spent };
}

describe.skipIf(!hasTestDatabase)('deleting a run on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1012 keeps every cost_ledger row and the totals when a run is deleted', async () => {
    const { runs, folders, logger, project, spend, ended, ledgerRows, totals, spent } =
      await setup(database);
    const doomed = await ended();
    const kept = await ended();
    await spend(doomed, 700n);
    await spend(kept, 300n);
    const before = await totals.projectGroups(amy, project.id);

    const result = await new DeleteRun({ runs, folders, logger }).execute({
      actor,
      runId: doomed.id,
    });

    expect(result.ok).toBe(true);
    expect(await runs.find(amy, doomed.id)).toBeUndefined();
    expect(await runs.find(amy, kept.id)).toEqual(kept);
    expect(await ledgerRows()).toBe(2);
    expect(await totals.projectGroups(amy, project.id)).toEqual(before);
    expect(await spent()).toBe(1_000n);
  });

  it('RF-1012 answers not found for a run that is already deleted', async () => {
    const { runs, folders, logger, ended } = await setup(database);
    const run = await ended();
    const deleteRun = new DeleteRun({ runs, folders, logger });

    await deleteRun.execute({ actor, runId: run.id });
    const again = await deleteRun.execute({ actor, runId: run.id });

    expect(again).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

describe.skipIf(!hasTestDatabase)('deleting a project on PostgreSQL', () => {
  const database = useTestDatabase();

  it('RF-1012 keeps every cost_ledger row and the user totals when a project is deleted', async () => {
    const { projects, runs, folders, logger, project, spend, ended, ledgerRows, totals, spent } =
      await setup(database);
    const [first, second] = [await ended(), await ended()];
    await spend(first, 400n);
    await spend(second, 250n);

    const result = await new DeleteProject({ projects, runs, folders, logger }).execute({
      actor,
      projectId: project.id,
    });

    expect(result.ok).toBe(true);
    expect(await projects.find(amy, project.id)).toBeUndefined();
    expect(await runs.list(amy, project.id)).toEqual([]);
    expect(await ledgerRows()).toBe(2);
    expect(await spent()).toBe(650n);
    expect(await totals.projectGroups(amy, project.id)).toHaveLength(2);
  });

  it('RF-1012 refuses to remove a project while a run of it is queued or running', async () => {
    const { projects, runs, project, ended } = await setup(database);
    const done = await ended();
    const queued = sampleRun({ userId: amy, projectId: project.id });
    await runs.insert(queued);

    expect(await projects.remove(amy, project.id, () => Promise.resolve())).toBe(false);

    expect(await projects.find(amy, project.id)).toEqual(project);
    expect(await runs.find(amy, queued.id)).toEqual(queued);
    expect(await runs.find(amy, done.id)).toEqual(done);
  });

  it('RF-1012 removes the run rows of a project with the project', async () => {
    const { projects, runs, project, ended } = await setup(database);
    const done = await ended();

    expect(await projects.remove(amy, project.id, () => Promise.resolve())).toBe(true);

    expect(await runs.find(amy, done.id)).toBeUndefined();
  });
});

describe.skipIf(!hasTestDatabase)('deleting a project on PostgreSQL when its folder stays', () => {
  const database = useTestDatabase();

  it('RF-1012 keeps the project and its runs when the folder cannot be removed (P1-121)', async () => {
    const { projects, runs, folders, logger, project, ended } = await setup(database);
    const done = await ended();
    folders.refuseRemoval = true;
    const deleteProject = new DeleteProject({ projects, runs, folders, logger });

    await expect(deleteProject.execute({ actor, projectId: project.id })).rejects.toMatchObject({
      code: ERROR_CODES.folderRemovalFailed,
    });

    expect(await projects.find(amy, project.id)).toEqual(project);
    expect(await runs.find(amy, done.id)).toEqual(done);
    folders.refuseRemoval = false;
    expect((await deleteProject.execute({ actor, projectId: project.id })).ok).toBe(true);
    expect(await runs.find(amy, done.id)).toBeUndefined();
  });
});
