import { describe, expect, it } from 'vitest';
import {
  folderSweepJob,
  ORPHAN_FOLDER_MIN_AGE_MS,
} from '../../../../src/application/projects/folder-sweep.js';
import type { Project } from '../../../../src/application/projects/project.js';
import type { FolderTarget } from '../../../../src/application/ports/workspace-folders.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// P1-152, RF-1012: the row is looked up again just before each removal, so a row written after the
// plan was made keeps its folder; and the guard counts the run folders it looked at.

const files = { 'manifest.json': 'x' };
const first = '00000000-0000-4000-a000-0000000000f1';
const second = '00000000-0000-4000-a000-0000000000f2';

/** The row of one project shows up from its second lookup on, as if written meanwhile. */
class RowAppearsOnSecondFind extends MemoryProjectRepository {
  private readonly late: Project;
  private lookups = 0;

  constructor(late: Project) {
    super();
    this.late = late;
  }

  override find(userId: string, projectId: string): Promise<Project | undefined> {
    if (projectId !== this.late.id) return super.find(userId, projectId);
    this.lookups += 1;
    return Promise.resolve(this.lookups >= 2 ? this.late : undefined);
  }
}

/** The run row of one folder shows up from the third listing on: after both folders were planned. */
class RowAppearsOnThirdList extends MemoryRunIndex {
  private readonly late: Run;
  private lists = 0;

  constructor(late: Run) {
    super();
    this.late = late;
  }

  override list(): Promise<readonly Run[]> {
    this.lists += 1;
    return Promise.resolve(this.lists >= 3 ? [this.late] : []);
  }
}

function setUp(parts: { projects?: MemoryProjectRepository; runs?: MemoryRunIndex } = {}) {
  const clock = new FixedClock('2026-10-17T09:00:00.000Z');
  const { projects = new MemoryProjectRepository(), runs = new MemoryRunIndex() } = parts;
  const folders = new MemoryWorkspaceFolders();
  const job = folderSweepJob({ projects, runs, folders, clock, logger: new RecordingLogger() });
  const old = clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS - 1;
  return { projects, runs, folders, job, old };
}

const projectOf = (projectId: string): FolderTarget => ({ userId: userAmy.userId, projectId });

describe('folderSweepJob row re-check before each removal', () => {
  it('RF-1012 keeps a project folder whose row appears after the plan and still removes the other', async () => {
    const late = sampleProject({ id: first, userId: userAmy.userId });
    const env = setUp({ projects: new RowAppearsOnSecondFind(late) });
    env.folders.seed(projectOf(first), files, env.old);
    env.folders.seed(projectOf(second), files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([projectOf(second)]);
  });

  it('RF-1012 keeps a run folder whose row appears after the plan and still removes the other', async () => {
    const project = sampleProject({ userId: userAmy.userId });
    const keys = ['20250101-000000-scan', '20250102-000000-scan'] as const;
    const late = sampleRun({ userId: userAmy.userId, projectId: project.id, runKey: keys[0] });
    const env = setUp({ runs: new RowAppearsOnThirdList(late) });
    await env.projects.insertOrFind(project);
    env.folders.seed(projectOf(project.id), files, env.old);
    for (const runKey of keys) {
      env.folders.seed({ ...projectOf(project.id), runKey }, files, env.old);
    }

    await env.job();

    expect(env.folders.removals).toEqual([{ ...projectOf(project.id), runKey: keys[1] }]);
  });
});

describe('folderSweepJob run folder guard counts', () => {
  async function runsOf(live: number, orphans: number) {
    const env = setUp();
    const project = sampleProject({ userId: userAmy.userId });
    await env.projects.insertOrFind(project);
    env.folders.seed(projectOf(project.id), files, env.old);
    const orphanTargets: FolderTarget[] = [];
    for (let index = 0; index < live + orphans; index += 1) {
      const target = {
        ...projectOf(project.id),
        runKey: `2025010${String(index + 1)}-000000-scan`,
      };
      env.folders.seed(target, files, env.old);
      if (index < live) {
        const row = sampleRun({ ...target, queueState: 'Ended', projectId: project.id });
        await env.runs.insert({ ...row, runKey: target.runKey });
      } else {
        orphanTargets.push(target);
      }
    }
    return { env, orphanTargets };
  }

  it('RF-1012 sweeps 3 orphan run folders among 7 run folders', async () => {
    const { env, orphanTargets } = await runsOf(4, 3);

    await env.job();

    expect(env.folders.removals).toEqual(orphanTargets);
  });

  it('RF-1012 sweeps exactly half of the run folders', async () => {
    const { env, orphanTargets } = await runsOf(3, 3);

    await env.job();

    expect(env.folders.removals).toEqual(orphanTargets);
  });

  it('RF-1012 refuses 4 orphan run folders among 7', async () => {
    const { env } = await runsOf(3, 4);

    await env.job();

    expect(env.folders.removals).toEqual([]);
  });
});
