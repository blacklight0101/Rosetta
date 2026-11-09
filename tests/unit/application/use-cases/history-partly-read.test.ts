import { describe, expect, it } from 'vitest';
import { ListHistory } from '../../../../src/application/use-cases/list-history.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { MemoryWorkspaceFolders } from '../../../support/memory-workspace-folders.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { partlyReadOf } from '../../../support/partly-read-doubles.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-230, RF-1008, DEC-220 (P8-130): the history carries, for each run, what its State badge needs to
// read "Partly read" as its page does, so the lists ask for no coverage per row.

describe('ListHistory: partly read runs (P8-130)', () => {
  it('RF-1008 RF-230 gives each run the partly read figures its reader worked out, with the whole list handed over once', async () => {
    const projects = new MemoryProjectRepository();
    const runs = new MemoryRunIndex();
    const project = sampleProject({ userId: userAmy.userId });
    await projects.insertOrFind(project);
    const make = (key: string, queuedAt: number) =>
      sampleRun({
        ...{ userId: userAmy.userId, projectId: project.id, runKey: key, queuedAt },
        ...{ stage: 'understand', queueState: 'Ended', endState: 'Completed' },
      });
    const partly = make('20261003-100000-understand', 2_000);
    const whole = make('20261002-100000-understand', 1_000);
    for (const run of [partly, whole]) await runs.insert(run);
    const partlyRead = partlyReadOf((run) =>
      run.id === partly.id ? { areas: 2, share: 0.16 } : { areas: 0, share: null },
    );
    const history = new ListHistory({
      ...{ projects, runs, logger: new RecordingLogger() },
      ...{ folders: new MemoryWorkspaceFolders(), manifests: new MemoryRunManifestStore() },
      partlyRead,
    });

    const result = await history.execute({ actor: userAmy, projectId: project.id });

    if (!result.ok) throw new Error('The history was not listed');
    expect(result.value.runs.map((each) => [each.run.runKey, each.partlyRead])).toEqual([
      ['20261003-100000-understand', { areas: 2, share: 0.16 }],
      ['20261002-100000-understand', { areas: 0, share: null }],
    ]);
    expect(partlyRead.listings).toEqual([[partly, whole]]);
  });
});
