import { describe, expect, it } from 'vitest';
import { DeleteProject } from '../../../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../../../src/application/use-cases/delete-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-1012, DEC-55, data-model.md section 9, P1-121 (finding 5 of the P1-40 verdict): a folder that
// cannot be removed never becomes an orphan. Both deletions remove the folder before the rows; a
// failed removal writes an `error` entry with RST-1115 naming the folder, answers that code and
// leaves the rows, so the project or run is still listed and the next Delete removes the folder.

const clock = new FixedClock('2026-10-13T10:00:00.000Z');

async function setup() {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const folders = new MemoryWorkspaceFolders();
  const logger = new MemoryLogger(clock, new SecretMasker());
  const project = sampleProject({ userId: userAmy.userId });
  await projects.insertOrFind(project);
  const target = { userId: userAmy.userId, projectId: project.id };
  folders.seed(target, { 'codemap.json': 'y'.repeat(50) });
  const run: Run = sampleRun({
    ...{ userId: userAmy.userId, projectId: project.id, queueState: 'Ended' },
    ...{ endState: 'Completed', startedAt: 1, endedAt: 2 },
  });
  await runs.insert(run);
  folders.seed({ ...target, runKey: run.runKey }, { 'manifest.json': 'x'.repeat(100) });
  return { projects, runs, folders, logger, project, target, run };
}

const refusal = { name: 'RosettaError', code: ERROR_CODES.folderRemovalFailed };

describe('DeleteProject when the folder cannot be removed', () => {
  it('RF-1012 logs the folder with RST-1115, keeps the project and its runs, and a retry cleans it up', async () => {
    const { projects, runs, folders, logger, project, target, run } = await setup();
    const deleteProject = new DeleteProject({ projects, runs, folders, logger });
    folders.refuseRemoval = true;

    const failed = deleteProject.execute({ actor: userAmy, projectId: project.id });

    await expect(failed).rejects.toBeInstanceOf(RosettaError);
    await expect(failed).rejects.toMatchObject(refusal);
    expect(await projects.find(userAmy.userId, project.id)).toEqual(project);
    expect(await runs.find(userAmy.userId, run.id)).toEqual(run);
    expect(folders.has(target)).toBe(true);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'error',
      logger: 'history',
      code: ERROR_CODES.folderRemovalFailed,
      userId: userAmy.userId,
      data: { folder: `projects/${project.id}` },
    });

    folders.refuseRemoval = false;
    const retried = await deleteProject.execute({ actor: userAmy, projectId: project.id });

    expect(retried).toEqual({ ok: true, value: { freedBytes: 150 } });
    expect(folders.has(target)).toBe(false);
    expect(await projects.find(userAmy.userId, project.id)).toBeUndefined();
  });
});

describe('DeleteRun when the folder cannot be removed', () => {
  it('RF-1012 logs the folder with RST-1115, keeps the run, and a retry cleans it up', async () => {
    const { runs, folders, logger, project, target, run } = await setup();
    const deleteRun = new DeleteRun({ runs, folders, logger });
    const runTarget = { ...target, runKey: run.runKey };
    folders.refuseRemoval = true;

    const failed = deleteRun.execute({ actor: userAmy, runId: run.id });

    await expect(failed).rejects.toMatchObject(refusal);
    expect(await runs.find(userAmy.userId, run.id)).toEqual(run);
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: 'error',
      code: ERROR_CODES.folderRemovalFailed,
      data: { folder: `projects/${project.id}/runs/${run.runKey}` },
    });

    folders.refuseRemoval = false;
    expect((await deleteRun.execute({ actor: userAmy, runId: run.id })).ok).toBe(true);
    expect(folders.has(runTarget)).toBe(false);
  });
});
