import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectRepository } from '../../../src/application/ports/project-repository.js';
import type { FolderTarget } from '../../../src/application/ports/workspace-folders.js';
import type { RunIndex } from '../../../src/application/ports/run-index.js';
import { folderSweepJob } from '../../../src/application/projects/folder-sweep.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../src/infrastructure/db/memory-run-index.js';
import { PgProjectRepository } from '../../../src/infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../../../src/infrastructure/db/pg-run-index.js';
import { PgUserRepository } from '../../../src/infrastructure/db/pg-user-repository.js';
import { NodeWorkspaceFolders } from '../../../src/infrastructure/files/node-workspace-folders.js';
import { sampleAccount } from '../../support/account-fixtures.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { useTempRoot } from '../../support/temp-root.js';

// P1-152, P2-41, RF-1012, RF-005: the sweep over real folders and both repositories (memory and
// PostgreSQL). It removes only folders of the data folder whose name is an id, that a delete marked and that no row owns,
// follows no link out of it and removes nothing when the rows cannot be read.

const user = '00000000-0000-4000-9000-0000000000a1';
const ghost = '00000000-0000-4000-a000-0000000000f1';
const strayRun = '20250101-000000-scan';
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);

interface Stores {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  /** Makes every later read of the rows fail. */
  readonly breakReads: () => Promise<void>;
}

type MakeStores = () => Promise<Stores>;

const data = useTempRoot('rosetta-sweep-');

const projectFolder = (projectId: string): string =>
  join(data.path, 'users', user, 'projects', projectId);

async function folder(path: string, ageHours = 5): Promise<void> {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'file.txt'), 'content');
  await utimes(path, hoursAgo(ageHours), hoursAgo(ageHours));
}

function sweep(stores: Stores, logger = new RecordingLogger()) {
  const folders = new NodeWorkspaceFolders(data.path);
  const clock = new FixedClock(new Date().toISOString());
  return { logger, run: folderSweepJob({ ...stores, folders, clock, logger }) };
}

/** Marks the folder, then sets its change instant back: marking changes the folder. */
async function markFolder(target: FolderTarget, ageHours = 5): Promise<void> {
  await new NodeWorkspaceFolders(data.path).mark(target);
  const path =
    target.runKey === undefined
      ? projectFolder(target.projectId)
      : join(projectFolder(target.projectId), 'runs', target.runKey);
  await utimes(path, hoursAgo(ageHours), hoursAgo(ageHours));
}

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

function removalTests(name: string, make: MakeStores): void {
  it(`RF-1012 ${name}: removes the marked folder of a deleted project and keeps the one with a row`, async () => {
    const stores = await make();
    const kept = sampleProject({ userId: user });
    await stores.projects.insertOrFind(kept);
    const run = sampleRun({ userId: user, projectId: kept.id, queueState: 'Ended' });
    await stores.runs.insert({ ...run, endState: 'Completed', startedAt: 1, endedAt: 2 });
    await folder(join(projectFolder(kept.id), 'runs', run.runKey));
    await folder(join(projectFolder(kept.id), 'runs', strayRun));
    // The project folder last: adding its run folders changed it.
    await folder(projectFolder(kept.id));
    await folder(projectFolder(ghost));
    await markFolder({ userId: user, projectId: ghost });
    await markFolder({ userId: user, projectId: kept.id, runKey: strayRun });
    const { run: job, logger } = sweep(stores);

    await job();

    expect(await exists(projectFolder(ghost))).toBe(false);
    expect(await exists(join(projectFolder(kept.id), 'runs', strayRun))).toBe(false);
    expect(await exists(join(projectFolder(kept.id), 'runs', run.runKey))).toBe(true);
    expect(await exists(projectFolder(kept.id))).toBe(true);
    expect(logger.records.filter((record) => record.level === 'info')).toHaveLength(2);
  });
}

function safetyTests(name: string, make: MakeStores): void {
  it(`P2-41 ${name}: keeps unmarked folders without rows, one or two of them, and logs them`, async () => {
    const stores = await make();
    const kept = sampleProject({ userId: user });
    await stores.projects.insertOrFind(kept);
    await folder(join(projectFolder(kept.id), 'runs', strayRun));
    await folder(projectFolder(kept.id));
    await folder(projectFolder(ghost));
    const { run: job, logger } = sweep(stores);

    await job();

    expect(await exists(projectFolder(ghost))).toBe(true);
    expect(await exists(join(projectFolder(kept.id), 'runs', strayRun))).toBe(true);
    expect(logger.records.filter((record) => record.level === 'info')).toEqual([]);
  });

  it(`P2-41 ${name}: keeps every folder when the database has no project row at all`, async () => {
    const stores = await make();
    await folder(projectFolder(ghost));
    await folder(projectFolder('00000000-0000-4000-a000-0000000000f2'));
    const { run: job } = sweep(stores);

    await job();

    expect(await exists(projectFolder(ghost))).toBe(true);
    expect(await exists(projectFolder('00000000-0000-4000-a000-0000000000f2'))).toBe(true);
  });
}

function crashTests(name: string, make: MakeStores): void {
  it(`P2-41 ${name}: clears the mark of a project whose row is still there (a crashed deletion)`, async () => {
    const stores = await make();
    const kept = sampleProject({ userId: user });
    await stores.projects.insertOrFind(kept);
    await folder(projectFolder(kept.id));
    await markFolder({ userId: user, projectId: kept.id });
    const { run: job } = sweep(stores);

    await job();

    expect(await exists(projectFolder(kept.id))).toBe(true);
    const listed = await new NodeWorkspaceFolders(data.path).list();
    expect(listed.map((entry) => entry.marked)).toEqual([false]);
  });

  it(`RF-1012 ${name}: leaves a young marked folder, whose deletion may be running`, async () => {
    const stores = await make();
    await folder(projectFolder(ghost), 0);
    await markFolder({ userId: user, projectId: ghost }, 0);
    const { run: job } = sweep(stores);

    await job();

    expect(await exists(projectFolder(ghost))).toBe(true);
  });
}

function linkTests(name: string, make: MakeStores): void {
  it(`RF-005 ${name}: follows no link out of the data folder and removes no folder outside it`, async () => {
    const stores = await make();
    // A sibling of the data folder: truly outside it.
    const outside = await mkdtemp(join(dirname(data.path), 'rosetta-outside-'));
    await folder(outside);
    await mkdir(join(data.path, 'users', user, 'projects'), { recursive: true });
    await symlink(outside, projectFolder(ghost), 'junction');
    const { run: job } = sweep(stores);

    await job();

    const content = await readFile(join(outside, 'file.txt'), 'utf8');
    const linkKept = await exists(projectFolder(ghost));
    await rm(outside, { recursive: true, force: true });
    expect(content).toBe('content');
    expect(linkKept).toBe(true);
  });

  it(`RF-1012 ${name}: removes only folders named by ids`, async () => {
    const stores = await make();
    await folder(join(data.path, 'users', user, 'projects', 'not-an-id'));
    await folder(join(data.path, 'sources', ghost));
    await folder(join(data.path, 'users', 'someone', 'projects', ghost));
    const { run: job } = sweep(stores);

    await job();

    expect(await exists(join(data.path, 'users', user, 'projects', 'not-an-id'))).toBe(true);
    expect(await exists(join(data.path, 'sources', ghost))).toBe(true);
    expect(await exists(join(data.path, 'users', 'someone', 'projects', ghost))).toBe(true);
  });
}

function sweepTests(name: string, make: MakeStores): void {
  removalTests(name, make);
  safetyTests(name, make);
  crashTests(name, make);
  linkTests(name, make);
  it(`RF-1012 ${name}: removes nothing when the rows cannot be read`, async () => {
    const stores = await make();
    await folder(projectFolder(ghost));
    await markFolder({ userId: user, projectId: ghost });
    await stores.breakReads();
    const { run: job, logger } = sweep(stores);

    await expect(job()).resolves.toBeUndefined();

    expect(await exists(projectFolder(ghost))).toBe(true);
    expect(logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
    expect(logger.records.map((record) => record.code)).not.toContain(
      ERROR_CODES.folderRemovalFailed,
    );
  });
}

describe('folder sweep with the memory repositories', () => {
  sweepTests('memory', () => {
    const projects = new MemoryProjectRepository();
    const runs = new MemoryRunIndex();
    const broken = new Error('connection refused');
    return Promise.resolve({
      projects,
      runs,
      breakReads: () => {
        projects.find = () => Promise.reject(broken);
        return Promise.resolve();
      },
    });
  });
});

describe.skipIf(!hasTestDatabase)('folder sweep with the PostgreSQL repositories', () => {
  const database = useTestDatabase();

  sweepTests('PostgreSQL', async () => {
    const { pool } = await database.createSchema({ migrate: true });
    await new PgUserRepository(pool).insert(sampleAccount({ id: user, userName: 'amy' }));
    return {
      projects: new PgProjectRepository(pool),
      runs: new PgRunIndex(pool),
      breakReads: async () => {
        await pool.query('DROP TABLE projects CASCADE');
      },
    };
  });
});
