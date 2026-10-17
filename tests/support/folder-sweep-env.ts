import {
  ORPHAN_FOLDER_MIN_AGE_MS,
  folderSweepJob,
} from '../../src/application/projects/folder-sweep.js';
import type { Project } from '../../src/application/projects/project.js';
import type { ScheduledJob } from '../../src/application/ports/scheduler.js';
import type { FolderTarget } from '../../src/application/ports/workspace-folders.js';
import type { Run } from '../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../src/infrastructure/db/memory-run-index.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryWorkspaceFolders } from './memory-workspace-folders.js';
import { sampleProject } from './project-fixtures.js';
import { RecordingLogger } from './recording-logger.js';
import { userAmy } from './run-harness.js';

// P2-41, P1-152: the set-up shared by the tests of the sweep of folders.

export const files = { 'manifest.json': 'x' };
export const orphanProject = '00000000-0000-4000-a000-0000000000f1';
export const otherOrphan = '00000000-0000-4000-a000-0000000000f2';
export const strayRun = '20250101-000000-scan';

export class UnreadableProjects extends MemoryProjectRepository {
  override find(): Promise<Project | undefined> {
    return Promise.reject(new Error('connection refused'));
  }
}

export class UnreadableRuns extends MemoryRunIndex {
  override list(): Promise<readonly Run[]> {
    return Promise.reject(new Error('connection refused'));
  }
}

/** A sweep over memory stores; `old` is a change instant old enough for the sweep to act on. */
export interface Env {
  readonly clock: FixedClock;
  readonly projects: MemoryProjectRepository;
  readonly runs: MemoryRunIndex;
  readonly folders: MemoryWorkspaceFolders;
  readonly logger: RecordingLogger;
  readonly job: ScheduledJob;
  readonly old: number;
}

export function setUp(
  parts: {
    projects?: MemoryProjectRepository;
    runs?: MemoryRunIndex;
    folders?: MemoryWorkspaceFolders;
  } = {},
): Env {
  const clock = new FixedClock('2026-10-17T09:00:00.000Z');
  const { projects = new MemoryProjectRepository(), runs = new MemoryRunIndex() } = parts;
  const { folders = new MemoryWorkspaceFolders() } = parts;
  const logger = new RecordingLogger();
  const job = folderSweepJob({ projects, runs, folders, clock, logger });
  const old = clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS - 1;
  return { clock, projects, runs, folders, logger, job, old };
}

export const projectOf = (projectId: string, userId = userAmy.userId): FolderTarget => ({
  userId,
  projectId,
});

export async function keptProject(env: Env): Promise<Project> {
  const project = sampleProject({ userId: userAmy.userId });
  await env.projects.insertOrFind(project);
  env.folders.seed(projectOf(project.id), files, env.old);
  return project;
}

export async function seedMarked(env: Env, target: FolderTarget): Promise<void> {
  env.folders.seed(target, files, env.old);
  await env.folders.mark(target);
}
