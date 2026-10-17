import { describe, expect, it } from 'vitest';
import type { FolderTarget } from '../../../../src/application/ports/workspace-folders.js';
import { DeleteProject } from '../../../../src/application/use-cases/delete-project.js';
import { DeleteRun } from '../../../../src/application/use-cases/delete-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// P2-41 (audit M1), RF-1012: a delete flow marks the folder before it removes any row, so the sweep
// of folders without rows can tell a folder somebody deleted from one a wrong database lost. A
// deletion that does not happen takes the mark off again.

const clock = new FixedClock('2026-10-17T10:00:00.000Z');

/** Remembers whether each folder carried the mark at the moment it was removed. */
class WatchedFolders extends MemoryWorkspaceFolders {
  readonly markedAtRemoval: boolean[] = [];
  refuseMark = false;

  override mark(target: FolderTarget): Promise<void> {
    if (this.refuseMark) return Promise.reject(new Error('EACCES: permission denied'));
    return super.mark(target);
  }

  override remove(target: FolderTarget): Promise<void> {
    this.markedAtRemoval.push(this.isMarked(target));
    return super.remove(target);
  }
}

/** Remembers whether the folder carried the mark when the project rows were removed. */
class WatchedProjects extends MemoryProjectRepository {
  markedAtRowRemoval: boolean | undefined;
  refuse = false;
  private readonly folders: WatchedFolders;
  private readonly target: FolderTarget;

  constructor(folders: WatchedFolders, target: FolderTarget) {
    super();
    this.folders = folders;
    this.target = target;
  }

  override remove(
    userId: string,
    projectId: string,
    afterRowsGone: () => Promise<void>,
  ): Promise<boolean> {
    this.markedAtRowRemoval = this.folders.isMarked(this.target);
    if (this.refuse) return Promise.resolve(false);
    return super.remove(userId, projectId, afterRowsGone);
  }
}

async function setup() {
  const folders = new WatchedFolders();
  const logger = new MemoryLogger(clock, new SecretMasker());
  const project = sampleProject({ userId: userAmy.userId });
  const target = { userId: userAmy.userId, projectId: project.id };
  const projects = new WatchedProjects(folders, target);
  await projects.insertOrFind(project);
  const runs = new MemoryRunIndex();
  const run = sampleRun({
    ...{ userId: userAmy.userId, projectId: project.id, queueState: 'Ended' },
    ...{ endState: 'Completed', startedAt: 1, endedAt: 2 },
  });
  await runs.insert(run);
  const runTarget = { ...target, runKey: run.runKey };
  folders.seed(target, { 'codemap.json': 'y' });
  folders.seed(runTarget, { 'manifest.json': 'x' });
  return { projects, runs, folders, logger, project, target, run, runTarget };
}

describe('DeleteProject marks the folder first', () => {
  it('P2-41 marks the project folder before the rows go and before the folder is removed', async () => {
    const { projects, runs, folders, logger, project } = await setup();

    await new DeleteProject({ projects, runs, folders, logger }).execute({
      actor: userAmy,
      projectId: project.id,
    });

    expect(projects.markedAtRowRemoval).toBe(true);
    expect(folders.markedAtRemoval).toEqual([true]);
  });

  it('P2-41 leaves the mark on a folder that could not be removed, for the sweep', async () => {
    const { projects, runs, folders, logger, project, target } = await setup();
    folders.refuseRemoval = true;

    const failed = new DeleteProject({ projects, runs, folders, logger }).execute({
      actor: userAmy,
      projectId: project.id,
    });

    await expect(failed).rejects.toMatchObject({ code: ERROR_CODES.folderRemovalFailed });
    expect(folders.isMarked(target)).toBe(true);
  });
});

describe('DeleteProject when the mark or the removal does not happen', () => {
  it('P2-41 deletes nothing and answers RST-1115 when the folder cannot be marked', async () => {
    const { projects, runs, folders, logger, project, target, run } = await setup();
    folders.refuseMark = true;

    const failed = new DeleteProject({ projects, runs, folders, logger }).execute({
      actor: userAmy,
      projectId: project.id,
    });

    await expect(failed).rejects.toBeInstanceOf(RosettaError);
    await expect(failed).rejects.toMatchObject({ code: ERROR_CODES.folderRemovalFailed });
    expect(await projects.find(userAmy.userId, project.id)).toBeDefined();
    expect(await runs.find(userAmy.userId, run.id)).toBeDefined();
    expect(folders.has(target)).toBe(true);
    expect(logger.entries[0]).toMatchObject({
      level: 'error',
      code: ERROR_CODES.folderRemovalFailed,
    });
  });

  it('P2-41 takes the mark off when the repository refuses to remove the project', async () => {
    const { projects, runs, folders, logger, project, target } = await setup();
    projects.refuse = true;

    const result = await new DeleteProject({ projects, runs, folders, logger }).execute({
      actor: userAmy,
      projectId: project.id,
    });

    expect(result.ok).toBe(false);
    expect(projects.markedAtRowRemoval).toBe(true);
    expect(folders.isMarked(target)).toBe(false);
    expect(folders.has(target)).toBe(true);
  });
});

describe('DeleteRun marks the folder first', () => {
  it('P2-41 marks the run folder before it is removed and before the row goes', async () => {
    const { runs, folders, logger, run } = await setup();

    await new DeleteRun({ runs, folders, logger }).execute({ actor: userAmy, runId: run.id });

    expect(folders.markedAtRemoval).toEqual([true]);
  });

  it('P2-41 leaves the mark and the row when the run folder cannot be removed', async () => {
    const { runs, folders, logger, run, runTarget } = await setup();
    folders.refuseRemoval = true;

    const failed = new DeleteRun({ runs, folders, logger }).execute({
      actor: userAmy,
      runId: run.id,
    });

    await expect(failed).rejects.toMatchObject({ code: ERROR_CODES.folderRemovalFailed });
    expect(folders.isMarked(runTarget)).toBe(true);
    expect(await runs.find(userAmy.userId, run.id)).toBeDefined();
  });

  it('P2-41 deletes nothing and answers RST-1115 when the run folder cannot be marked', async () => {
    const { runs, folders, logger, run, runTarget } = await setup();
    folders.refuseMark = true;

    const failed = new DeleteRun({ runs, folders, logger }).execute({
      actor: userAmy,
      runId: run.id,
    });

    await expect(failed).rejects.toMatchObject({ code: ERROR_CODES.folderRemovalFailed });
    expect(folders.has(runTarget)).toBe(true);
    expect(await runs.find(userAmy.userId, run.id)).toBeDefined();
  });
});
