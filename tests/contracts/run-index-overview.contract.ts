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

// Architecture section 7: every RunIndex adapter passes these cases of `projectSummaries`.
// RF-1008, RF-1108: one read gives the run count and the newest run of each of the user's projects;
// RF-1105: only the user's own rows, and only the projects asked for.

export function runIndexOverviewContract(name: string, fresh: FreshRuns): void {
  it(`RF-1008 ${name} gives each project its run count and its newest run in one read`, async () => {
    const index = await fresh();
    await index.insert(sampleRun({ userId: runAmy, projectId: amyProject, queuedAt: 1_000 }));
    const newest = sampleRun({ userId: runAmy, projectId: amyProject, queuedAt: 3_000 });
    await index.insert(newest);
    await index.insert(sampleRun({ userId: runAmy, projectId: amyProject, queuedAt: 2_000 }));
    const other = sampleRun({ userId: runAmy, projectId: amySecondProject, queuedAt: 500 });
    await index.insert(other);

    const summaries = await index.projectSummaries(runAmy, [amyProject, amySecondProject]);

    expect(summaries.toSorted((left, right) => left.runs - right.runs)).toEqual([
      { projectId: amySecondProject, runs: 1, latest: other },
      { projectId: amyProject, runs: 3, latest: newest },
    ]);
  });

  it(`RF-1008 ${name} leaves out a project without runs and a project that was not asked for`, async () => {
    const index = await fresh();
    await index.insert(sampleRun({ userId: runAmy, projectId: amyProject }));
    await index.insert(sampleRun({ userId: runAmy, projectId: amySecondProject }));

    const summaries = await index.projectSummaries(runAmy, [amyProject, bobProject]);

    expect(summaries.map((summary) => summary.projectId)).toEqual([amyProject]);
    expect(await index.projectSummaries(runAmy, [])).toEqual([]);
  });

  it(`RF-1105 ${name} never counts the runs of another user`, async () => {
    const index = await fresh();
    await index.insert(sampleRun({ userId: runBob, projectId: bobProject }));

    expect(await index.projectSummaries(runAmy, [bobProject])).toEqual([]);
    expect(await index.projectSummaries(runBob, [bobProject])).toHaveLength(1);
  });
}
