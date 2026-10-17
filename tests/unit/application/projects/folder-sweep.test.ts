import { describe, expect, it } from 'vitest';
import {
  folderSweepJob,
  ORPHAN_FOLDER_MIN_AGE_MS,
} from '../../../../src/application/projects/folder-sweep.js';
import type { Project } from '../../../../src/application/projects/project.js';
import type { FolderTarget } from '../../../../src/application/ports/workspace-folders.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// P1-152, RF-1012, DEC-55: the sweep removes the project and run folders that have no row, and only
// those. A folder that is young (its row may be about to be written), a folder with a row and
// every folder when the database cannot be read are left alone.

const files = { 'manifest.json': 'x' };
const orphanProject = '00000000-0000-4000-a000-0000000000f1';
const otherOrphan = '00000000-0000-4000-a000-0000000000f2';
const strayRun = '20250101-000000-scan';

class UnreadableProjects extends MemoryProjectRepository {
  override find(): Promise<Project | undefined> {
    return Promise.reject(new Error('connection refused'));
  }
}

class UnreadableRuns extends MemoryRunIndex {
  override list(): Promise<readonly Run[]> {
    return Promise.reject(new Error('connection refused'));
  }
}

/** The row of the project appears right after the folders were listed. */
class ProjectAppearsAfterListing extends MemoryWorkspaceFolders {
  readonly late: () => Promise<unknown>;

  constructor(late: () => Promise<unknown>) {
    super();
    this.late = late;
  }

  override async list() {
    const listed = await super.list();
    await this.late();
    return listed;
  }
}

function setUp(
  parts: {
    projects?: MemoryProjectRepository;
    runs?: MemoryRunIndex;
    folders?: MemoryWorkspaceFolders;
  } = {},
) {
  const clock = new FixedClock('2026-10-17T09:00:00.000Z');
  const { projects = new MemoryProjectRepository(), runs = new MemoryRunIndex() } = parts;
  const { folders = new MemoryWorkspaceFolders() } = parts;
  const logger = new RecordingLogger();
  const job = folderSweepJob({ projects, runs, folders, clock, logger });
  const old = clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS - 1;
  return { clock, projects, runs, folders, logger, job, old };
}

const projectOf = (projectId: string, userId = userAmy.userId): FolderTarget => ({
  userId,
  projectId,
});

async function keptProject(env: ReturnType<typeof setUp>): Promise<Project> {
  const project = sampleProject({ userId: userAmy.userId });
  await env.projects.insertOrFind(project);
  env.folders.seed(projectOf(project.id), files, env.old);
  return project;
}

describe('folderSweepJob removals of folders without rows', () => {
  it('RF-1012 removes a project folder with no row, with its runs, and logs it', async () => {
    const env = setUp();
    const target = projectOf(orphanProject);
    env.folders.seed(target, files, env.old);
    env.folders.seed({ ...target, runKey: '20261012-100000-scan' }, files, env.old);

    await env.job();

    expect(env.folders.has(target)).toBe(false);
    expect(env.folders.removals).toEqual([target]);
    expect(env.logger.records).toHaveLength(1);
    expect(env.logger.records[0]).toMatchObject({
      level: 'info',
      userId: userAmy.userId,
      data: { projectId: orphanProject },
    });
  });
});

describe('folderSweepJob folders with rows', () => {
  it('RF-1012 never removes a folder that still has a row, nor the runs that have one', async () => {
    const env = setUp();
    const project = await keptProject(env);
    const run = sampleRun({ userId: userAmy.userId, projectId: project.id, queueState: 'Ended' });
    await env.runs.insert(run);
    env.folders.seed({ ...projectOf(project.id), runKey: run.runKey }, files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([]);
  });

  it('RF-1012 removes the run folder with no row inside a project that has one', async () => {
    const env = setUp();
    const project = await keptProject(env);
    const run = sampleRun({ userId: userAmy.userId, projectId: project.id, queueState: 'Ended' });
    await env.runs.insert(run);
    env.folders.seed({ ...projectOf(project.id), runKey: run.runKey }, files, env.old);
    const stray = { ...projectOf(project.id), runKey: strayRun };
    env.folders.seed(stray, files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([stray]);
  });

  it("RF-1012 removes a project folder under another user's workspace than its row's", async () => {
    const env = setUp();
    const project = await keptProject(env);
    const misplaced = projectOf(project.id, userBob.userId);
    env.folders.seed(misplaced, files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([misplaced]);
    expect(env.folders.has(projectOf(project.id))).toBe(true);
  });
});

describe('folderSweepJob removal failures', () => {
  it('RF-1012 logs a folder that cannot be removed with RST-1115 and goes on with the next', async () => {
    const env = setUp();
    env.folders.seed(projectOf(orphanProject), files, env.old);
    env.folders.seed(projectOf(otherOrphan), files, env.old);
    env.folders.refuseRemovalOf(projectOf(orphanProject));

    await env.job();

    expect(env.folders.removals).toEqual([projectOf(otherOrphan)]);
    expect(env.logger.records.map((record) => record.code)).toContain(
      ERROR_CODES.folderRemovalFailed,
    );
  });
});

describe('folderSweepJob young folders and races', () => {
  it('RF-1012 leaves a young folder alone, a folder created before its row, until it is old', async () => {
    const env = setUp();
    const target = projectOf(orphanProject);
    env.folders.seed(target, files, env.clock.now().getTime() - 1000);
    env.folders.seed({ ...target, runKey: '20261012-100000-scan' }, files, env.old);

    await env.job();
    expect(env.folders.removals).toEqual([]);

    env.clock.advance(ORPHAN_FOLDER_MIN_AGE_MS);
    await env.job();
    expect(env.folders.removals).toEqual([target]);
  });

  it('RF-1012 leaves a folder alone when its row appears after the folders were listed', async () => {
    const projects = new MemoryProjectRepository();
    const project = sampleProject({ userId: userAmy.userId });
    const folders = new ProjectAppearsAfterListing(() => projects.insertOrFind(project));
    const env = setUp({ projects, folders });
    folders.seed(projectOf(project.id), files, env.old);

    await env.job();

    expect(folders.removals).toEqual([]);
  });
});

describe('folderSweepJob unreadable data', () => {
  it('RF-1012 removes nothing when the project rows cannot be read, and does not reject', async () => {
    const env = setUp({ projects: new UnreadableProjects() });
    env.folders.seed(projectOf(orphanProject), files, env.old);
    env.folders.seed(projectOf(otherOrphan), files, env.old);

    await expect(env.job()).resolves.toBeUndefined();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
  });

  it('RF-1012 removes no run folder when the run rows cannot be read', async () => {
    const projects = new MemoryProjectRepository();
    const env = setUp({ projects, runs: new UnreadableRuns() });
    const project = await keptProject(env);
    env.folders.seed({ ...projectOf(project.id), runKey: strayRun }, files, env.old);

    await expect(env.job()).resolves.toBeUndefined();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
  });

  it('RF-1012 removes nothing when the data folder cannot be listed, and does not reject', async () => {
    const env = setUp();
    env.folders.seed(projectOf(orphanProject), files, env.old);
    env.folders.refuseListing = true;

    await expect(env.job()).resolves.toBeUndefined();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
  });
});

describe('folderSweepJob age boundary', () => {
  it('RF-1012 removes a folder exactly one hour old and keeps one a millisecond younger', async () => {
    const env = setUp();
    const exact = projectOf(orphanProject);
    env.folders.seed(exact, files, env.clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS);
    env.folders.seed(
      projectOf(otherOrphan),
      files,
      env.clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS + 1,
    );

    await env.job();

    expect(env.folders.removals).toEqual([exact]);
  });
});

function seedOrphans(env: ReturnType<typeof setUp>, count: number): FolderTarget[] {
  const targets = Array.from({ length: count }, (_, index) =>
    projectOf(`00000000-0000-4000-a000-00000000e${String(index).padStart(3, '0')}`),
  );
  for (const target of targets) env.folders.seed(target, files, env.old);
  return targets;
}

describe('folderSweepJob guard against a database that is readable but wrong', () => {
  it('RF-1012 removes nothing when no project has a row but several project folders exist', async () => {
    const env = setUp();
    seedOrphans(env, 4);

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toHaveLength(1);
    expect(env.logger.records[0]).toMatchObject({
      level: 'error',
      code: ERROR_CODES.folderRemovalFailed,
    });
  });

  it('RF-1012 removes nothing when the pass would remove more than half of the project folders', async () => {
    const env = setUp();
    for (let index = 0; index < 3; index += 1) await keptProject(env);
    seedOrphans(env, 4);

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records[0]).toMatchObject({ level: 'error' });
  });

  it('RF-1012 removes up to half of the project folders, and any few under the floor', async () => {
    const env = setUp();
    for (let index = 0; index < 3; index += 1) await keptProject(env);
    const orphans = seedOrphans(env, 3);

    await env.job();

    expect(env.folders.removals).toEqual(orphans);
  });

  it('RF-1012 removes nothing when the pass would remove most run folders of the projects with rows', async () => {
    const env = setUp();
    const project = await keptProject(env);
    for (const key of ['20250101-000000-scan', '20250102-000000-scan', '20250103-000000-scan']) {
      env.folders.seed({ ...projectOf(project.id), runKey: key }, files, env.old);
    }

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records[0]).toMatchObject({ level: 'error' });
  });
});
