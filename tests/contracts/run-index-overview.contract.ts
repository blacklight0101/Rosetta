import { expect, it } from 'vitest';
import {
  amyProject,
  amySecondProject,
  bobProject,
  runAmy,
  runBob,
  type FreshRuns,
} from './run-index.contract.js';
import { sampleRun } from '../support/run-fixtures.js';

// Architecture section 7: every RunIndex adapter passes these cases of `listOfProjects`.
// RF-1008, RF-010, P8-137: one read gives every run of each asked project, newest first within a
// project, so the overview counts the runs and makes each journey (DEC-226) without a read per
// project; RF-1105: only the user's own rows, and only the projects asked for.

const ids = (runs: readonly { readonly id: string }[]): readonly string[] =>
  runs.map((run) => run.id);

export function runIndexOverviewContract(name: string, fresh: FreshRuns): void {
  it(`RF-1008 ${name} gives the runs of each asked project in one read, newest first`, async () => {
    const index = await fresh();
    const oldest = sampleRun({ userId: runAmy, projectId: amyProject, queuedAt: 1_000 });
    const newest = sampleRun({ userId: runAmy, projectId: amyProject, queuedAt: 3_000 });
    const middle = sampleRun({ userId: runAmy, projectId: amyProject, queuedAt: 2_000 });
    const other = sampleRun({ userId: runAmy, projectId: amySecondProject, queuedAt: 500 });
    for (const run of [oldest, newest, middle, other]) await index.insert(run);

    const runs = await index.listOfProjects(runAmy, [amyProject, amySecondProject]);

    expect(ids(runs.filter((run) => run.projectId === amyProject))).toEqual(
      ids([newest, middle, oldest]),
    );
    expect(runs.filter((run) => run.projectId === amySecondProject)).toEqual([other]);
    expect(runs.find((run) => run.id === newest.id)).toEqual(await index.find(runAmy, newest.id));
  });

  it(`RF-1008 ${name} leaves out a project that was not asked for`, async () => {
    const index = await fresh();
    await index.insert(sampleRun({ userId: runAmy, projectId: amyProject }));
    await index.insert(sampleRun({ userId: runAmy, projectId: amySecondProject }));

    const runs = await index.listOfProjects(runAmy, [amyProject, bobProject]);

    expect(runs.map((run) => run.projectId)).toEqual([amyProject]);
    expect(await index.listOfProjects(runAmy, [])).toEqual([]);
  });

  it(`RF-1105 ${name} never lists the runs of another user`, async () => {
    const index = await fresh();
    await index.insert(sampleRun({ userId: runBob, projectId: bobProject }));

    expect(await index.listOfProjects(runAmy, [bobProject])).toEqual([]);
    expect(await index.listOfProjects(runBob, [bobProject])).toHaveLength(1);
  });
}
