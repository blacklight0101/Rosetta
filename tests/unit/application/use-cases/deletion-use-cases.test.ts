import { describe, expect, it } from 'vitest';
import { DeleteProject } from '../../../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../../../src/application/use-cases/delete-run.js';
import { DeleteSnapshot } from '../../../../src/application/use-cases/delete-snapshot.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemorySnapshotCache } from '../../../support/memory-snapshot-cache.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';
import { sampleCachedSnapshot } from '../../../support/snapshot-listing-fixtures.js';

// RF-1012, DEC-55, RF-1105: deleting a run, a project and a snapshot.

const admin = { userId: '00000000-0000-4000-9000-0000000000ad', role: 'admin' } as const;
const clock = new FixedClock('2026-10-12T10:00:00.000Z');

async function setup() {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const folders = new MemoryWorkspaceFolders();
  const logger = new MemoryLogger(clock, new SecretMasker());
  const project = sampleProject({ userId: userAmy.userId });
  await projects.insertOrFind(project);
  const target = { userId: userAmy.userId, projectId: project.id };
  const ended = async (overrides: Partial<Run> = {}): Promise<Run> => {
    const run = sampleRun({
      ...{ userId: userAmy.userId, projectId: project.id, queueState: 'Ended' },
      ...{ endState: 'Completed', startedAt: 1, endedAt: 2, ...overrides },
    });
    await runs.insert(run);
    folders.seed({ ...target, runKey: run.runKey }, { 'manifest.json': 'x'.repeat(100) });
    return run;
  };
  return { projects, runs, folders, logger, project, target, ended };
}

function snapshotSetup() {
  const snapshots = new MemorySnapshotCache();
  const runs = new MemoryRunIndex();
  const logger = new MemoryLogger(clock, new SecretMasker());
  const snapshot = sampleCachedSnapshot();
  snapshots.add(snapshot);
  const deleteSnapshot = new DeleteSnapshot({ snapshots, runs, logger });
  return { snapshots, runs, logger, snapshot, deleteSnapshot };
}

describe('DeleteRun', () => {
  it('RF-1012 removes the run folder and the run, reports the space freed and writes an info entry', async () => {
    const { runs, folders, logger, project, target, ended } = await setup();
    const doomed = await ended();
    const kept = await ended();

    const result = await new DeleteRun({ runs, folders, logger }).execute({
      actor: userAmy,
      runId: doomed.id,
    });

    expect(result).toEqual({ ok: true, value: { freedBytes: 100 } });
    expect(await runs.find(userAmy.userId, doomed.id)).toBeUndefined();
    expect(await runs.find(userAmy.userId, kept.id)).toEqual(kept);
    expect(folders.has({ ...target, runKey: doomed.runKey })).toBe(false);
    expect(folders.has({ ...target, runKey: kept.runKey })).toBe(true);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'info',
      userId: userAmy.userId,
      data: { projectId: project.id, runKey: doomed.runKey, freedBytes: 100 },
    });
  });
});

describe('DeleteRun refusals', () => {
  it.each(['Queued', 'Running'] as const)(
    'RF-1012 refuses a %s run and removes nothing',
    async (queueState) => {
      const { runs, folders, logger, project, target } = await setup();
      const common = { userId: userAmy.userId, projectId: project.id };
      const live = queueState === 'Running' ? runningRun(common) : sampleRun(common);
      await runs.insert(live);
      folders.seed({ ...target, runKey: live.runKey }, { 'events.jsonl': '{}' });

      const result = await new DeleteRun({ runs, folders, logger }).execute({
        actor: userAmy,
        runId: live.id,
      });

      expect(result).toEqual({ ok: false, error: ERROR_CODES.deleteRefusedInUse });
      expect(await runs.find(userAmy.userId, live.id)).toEqual(live);
      expect(folders.removals).toEqual([]);
      expect(logger.entries).toEqual([]);
    },
  );

  it("RF-1105 answers not found for another user's run and for an unknown id, removing nothing", async () => {
    const { runs, folders, logger, ended } = await setup();
    const run = await ended();
    const deleteRun = new DeleteRun({ runs, folders, logger });

    const other = await deleteRun.execute({ actor: userBob, runId: run.id });
    const unknown = await deleteRun.execute({ actor: userAmy, runId: 'not-a-uuid' });

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual(other);
    expect(folders.removals).toEqual([]);
    expect(await runs.find(userAmy.userId, run.id)).toEqual(run);
  });
});

describe('DeleteProject', () => {
  it('RF-1012 removes the project folder, its runs and the project, and writes an info entry', async () => {
    const { projects, runs, folders, logger, project, target, ended } = await setup();
    const first = await ended();
    const second = await ended();
    folders.seed(target, { 'codemap.json': 'y'.repeat(50) });

    const result = await new DeleteProject({ projects, runs, folders, logger }).execute({
      actor: userAmy,
      projectId: project.id,
    });

    expect(result).toEqual({ ok: true, value: { freedBytes: 250 } });
    expect(await projects.find(userAmy.userId, project.id)).toBeUndefined();
    expect(await runs.list(userAmy.userId, project.id)).toEqual([]);
    expect(await runs.find(userAmy.userId, first.id)).toBeUndefined();
    expect(await runs.find(userAmy.userId, second.id)).toBeUndefined();
    expect(folders.has(target)).toBe(false);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'info',
      data: { projectId: project.id, freedBytes: 250 },
    });
  });
});

describe('DeleteProject refusals', () => {
  it('RF-1012 refuses a project with a run that is running and removes nothing', async () => {
    const { projects, runs, folders, logger, project, target, ended } = await setup();
    const done = await ended();
    await runs.insert(runningRun({ userId: userAmy.userId, projectId: project.id }));

    const result = await new DeleteProject({ projects, runs, folders, logger }).execute({
      actor: userAmy,
      projectId: project.id,
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.deleteRefusedInUse });
    expect(await projects.find(userAmy.userId, project.id)).toEqual(project);
    expect(await runs.find(userAmy.userId, done.id)).toEqual(done);
    expect(folders.removals).toEqual([]);
    expect(folders.has(target)).toBe(true);
  });

  it("RF-1105 answers not found for another user's project and for an unknown id", async () => {
    const { projects, runs, folders, logger, project } = await setup();
    const deleteProject = new DeleteProject({ projects, runs, folders, logger });

    const other = await deleteProject.execute({ actor: userBob, projectId: project.id });
    const unknown = await deleteProject.execute({ actor: userAmy, projectId: 'not-a-uuid' });

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual(other);
    expect(await projects.find(userAmy.userId, project.id)).toEqual(project);
    expect(folders.removals).toEqual([]);
  });
});

describe('DeleteSnapshot', () => {
  it('RF-1012 removes a snapshot that only ended runs used, reports its size and writes an info entry', async () => {
    const { snapshots, runs, snapshot, logger, deleteSnapshot } = snapshotSetup();
    const done = { snapshotKey: snapshot.key, queueState: 'Ended', endState: 'Completed' } as const;
    await runs.insert(sampleRun({ ...done, startedAt: 1, endedAt: 2 }));

    const result = await deleteSnapshot.execute({ actor: admin, key: snapshot.key });

    expect(result).toEqual({ ok: true, value: { freedBytes: snapshot.totalBytes } });
    expect(await snapshots.list()).toEqual([]);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'info',
      userId: admin.userId,
      data: { snapshot: snapshot.key, freedBytes: snapshot.totalBytes },
    });
  });
});

describe('DeleteSnapshot refusals', () => {
  it.each(['Queued', 'Running'] as const)(
    'RF-1012 refuses a snapshot that a %s run uses',
    async (queueState) => {
      const { snapshots, runs, snapshot, logger, deleteSnapshot } = snapshotSetup();
      const common = { snapshotKey: snapshot.key };
      await runs.insert(queueState === 'Running' ? runningRun(common) : sampleRun(common));

      const result = await deleteSnapshot.execute({ actor: admin, key: snapshot.key });

      expect(result).toEqual({ ok: false, error: ERROR_CODES.deleteRefusedInUse });
      expect(await snapshots.list()).toEqual([snapshot]);
      expect(logger.entries).toEqual([]);
    },
  );

  it('RF-1012 refuses a user who is not the administrator and answers not found for an unknown key', async () => {
    const { snapshots, snapshot, deleteSnapshot } = snapshotSetup();

    const user = await deleteSnapshot.execute({ actor: userAmy, key: snapshot.key });
    const unknown = await deleteSnapshot.execute({ actor: admin, key: 'octo__none@x' });

    expect(user).toEqual({ ok: false, error: ERROR_CODES.notAllowed });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await snapshots.list()).toEqual([snapshot]);
  });
});
