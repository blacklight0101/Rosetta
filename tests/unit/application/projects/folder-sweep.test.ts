import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  files,
  keptProject,
  orphanProject,
  otherOrphan,
  projectOf,
  seedMarked,
  setUp,
  strayRun,
  UnreadableProjects,
  UnreadableRuns,
} from '../../../support/folder-sweep-env.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// P2-41 (audit M1), P1-152, RF-1012, DEC-55: the sweep removes only folders a delete flow marked
// (and whose row is gone). An unmarked folder with no row is logged and kept, so a new, empty,
// wrong or restored database cannot make the sweep delete a project's files.

describe('folderSweepJob removes a marked project folder whose row is gone', () => {
  it('RF-1012 removes it with its runs, and logs it', async () => {
    const env = setUp();
    const target = projectOf(orphanProject);
    await seedMarked(env, target);
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

  it('RF-1012 removes it even when it is the last one and the database is empty', async () => {
    const env = setUp();
    await seedMarked(env, projectOf(orphanProject));

    await env.job();

    expect(env.folders.removals).toEqual([projectOf(orphanProject)]);
  });

  it('RF-1012 removes it under another workspace than the one of the row of the project', async () => {
    const env = setUp();
    const project = await keptProject(env);
    const misplaced = projectOf(project.id, '00000000-0000-4000-9000-0000000000b2');
    await seedMarked(env, misplaced);

    await env.job();

    expect(env.folders.removals).toEqual([misplaced]);
    expect(env.folders.has(projectOf(project.id))).toBe(true);
  });
});

describe('folderSweepJob removes a marked run folder whose row is gone', () => {
  it('RF-1012 removes the marked one and keeps an unmarked one', async () => {
    const env = setUp();
    const project = await keptProject(env);
    const marked = { ...projectOf(project.id), runKey: strayRun };
    const unmarked = { ...projectOf(project.id), runKey: '20250102-000000-scan' };
    await seedMarked(env, marked);
    env.folders.seed(unmarked, files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([marked]);
    expect(env.folders.has(unmarked)).toBe(true);
  });
});

describe('folderSweepJob never removes an unmarked project folder', () => {
  it('P2-41 keeps 1 orphan folder against an empty database, and logs it', async () => {
    const env = setUp();
    env.folders.seed(projectOf(orphanProject), files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records.length).toBeGreaterThan(0);
    expect(env.logger.records.every((record) => record.level !== 'info')).toBe(true);
  });

  it('P2-41 keeps 2 orphan folders against an empty database', async () => {
    const env = setUp();
    env.folders.seed(projectOf(orphanProject), files, env.old);
    env.folders.seed(projectOf(otherOrphan), files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.folders.has(projectOf(orphanProject))).toBe(true);
    expect(env.folders.has(projectOf(otherOrphan))).toBe(true);
  });

  it('P2-41 keeps 2 of 5 folders that a stale restore left without rows (40 percent)', async () => {
    const env = setUp();
    for (let index = 0; index < 3; index += 1) await keptProject(env);
    env.folders.seed(projectOf(orphanProject), files, env.old);
    env.folders.seed(projectOf(otherOrphan), files, env.old);

    await env.job();

    expect(env.folders.removals).toEqual([]);
    const kept = env.logger.records.filter((record) => record.level === 'warn');
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ logger: 'folder-sweep', userId: userAmy.userId });
  });
});

describe('folderSweepJob keeps folders when the database looks wrong or has the rows', () => {
  it('P2-41 keeps an unmarked run folder with no row, however many there are', async () => {
    const env = setUp();
    const project = await keptProject(env);
    for (const key of ['20250101-000000-scan', '20250102-000000-scan', '20250103-000000-scan']) {
      env.folders.seed({ ...projectOf(project.id), runKey: key }, files, env.old);
    }

    await env.job();

    expect(env.folders.removals).toEqual([]);
  });

  it('P2-41 refuses with an error when no project has a row but unmarked folders exist', async () => {
    const env = setUp();
    env.folders.seed(projectOf(orphanProject), files, env.old);
    await seedMarked(env, projectOf(otherOrphan));

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toContainEqual(
      expect.objectContaining({ level: 'error', code: ERROR_CODES.folderRemovalFailed }),
    );
  });

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
});

describe('folderSweepJob unreadable data', () => {
  it('RF-1012 removes nothing when the project rows cannot be read, and does not reject', async () => {
    const env = setUp({ projects: new UnreadableProjects() });
    await seedMarked(env, projectOf(orphanProject));
    await seedMarked(env, projectOf(otherOrphan));

    await expect(env.job()).resolves.toBeUndefined();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
  });

  it('RF-1012 removes no run folder when the run rows cannot be read', async () => {
    const env = setUp({ runs: new UnreadableRuns() });
    const project = await keptProject(env);
    await seedMarked(env, { ...projectOf(project.id), runKey: strayRun });

    await expect(env.job()).resolves.toBeUndefined();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
  });

  it('RF-1012 removes nothing when the data folder cannot be listed, and does not reject', async () => {
    const env = setUp();
    await seedMarked(env, projectOf(orphanProject));
    env.folders.refuseListing = true;

    await expect(env.job()).resolves.toBeUndefined();

    expect(env.folders.removals).toEqual([]);
    expect(env.logger.records).toEqual([expect.objectContaining({ level: 'error' })]);
  });
});
