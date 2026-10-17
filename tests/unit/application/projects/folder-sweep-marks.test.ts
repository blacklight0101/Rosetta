import { describe, expect, it } from 'vitest';
import { ORPHAN_FOLDER_MIN_AGE_MS } from '../../../../src/application/projects/folder-sweep.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  files,
  keptProject,
  orphanProject,
  otherOrphan,
  projectOf,
  seedMarked,
  setUp,
} from '../../../support/folder-sweep-env.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// P2-41 (audit M1), RF-1012: a mark whose row is still there is a deletion that did not finish,
// and is cleared; a young mark may belong to a deletion running now; a folder that cannot be
// removed is logged and the sweep goes on.

describe('folderSweepJob recovers a deletion that crashed after the mark', () => {
  it('P2-41 clears the mark of a project whose row is still there, and keeps its folder', async () => {
    const env = setUp();
    const project = await keptProject(env);
    await env.folders.mark(projectOf(project.id));

    await env.job();

    expect(env.folders.removals).toEqual([]);
    expect(env.folders.isMarked(projectOf(project.id))).toBe(false);
    expect(env.folders.has(projectOf(project.id))).toBe(true);
  });

  it('P2-41 clears the mark of a run folder whose row is still there', async () => {
    const env = setUp();
    const project = await keptProject(env);
    const run = sampleRun({ userId: userAmy.userId, projectId: project.id, queueState: 'Ended' });
    await env.runs.insert(run);
    const target = { ...projectOf(project.id), runKey: run.runKey };
    await seedMarked(env, target);

    await env.job();

    expect(env.folders.isMarked(target)).toBe(false);
    expect(env.folders.has(target)).toBe(true);
  });

  it('P2-41 leaves a young mark alone: its deletion may be running now', async () => {
    const env = setUp();
    const project = sampleProject({ userId: userAmy.userId });
    await env.projects.insertOrFind(project);
    const target = projectOf(project.id);
    env.folders.seed(target, files, env.clock.now().getTime() - 1000);
    await env.folders.mark(target);

    await env.job();

    expect(env.folders.isMarked(target)).toBe(true);
  });
});

describe('folderSweepJob removal failures', () => {
  it('RF-1012 logs a folder that cannot be removed with RST-1115 and goes on with the next', async () => {
    const env = setUp();
    await seedMarked(env, projectOf(orphanProject));
    await seedMarked(env, projectOf(otherOrphan));
    env.folders.refuseRemovalOf(projectOf(orphanProject));

    await env.job();

    expect(env.folders.removals).toEqual([projectOf(otherOrphan)]);
    expect(env.logger.records.map((record) => record.code)).toContain(
      ERROR_CODES.folderRemovalFailed,
    );
  });
});

describe('folderSweepJob young folders', () => {
  it('RF-1012 leaves a young marked folder alone until it is old, and removes it then', async () => {
    const env = setUp();
    const target = projectOf(orphanProject);
    env.folders.seed(target, files, env.clock.now().getTime() - 1000);
    await env.folders.mark(target);

    await env.job();
    expect(env.folders.removals).toEqual([]);

    env.clock.advance(ORPHAN_FOLDER_MIN_AGE_MS);
    await env.job();
    expect(env.folders.removals).toEqual([target]);
  });

  it('RF-1012 removes a marked folder exactly one hour old and keeps one a millisecond younger', async () => {
    const env = setUp();
    const exact = projectOf(orphanProject);
    const young = projectOf(otherOrphan);
    env.folders.seed(exact, files, env.clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS);
    env.folders.seed(young, files, env.clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS + 1);
    await env.folders.mark(exact);
    await env.folders.mark(young);

    await env.job();

    expect(env.folders.removals).toEqual([exact]);
  });
});
