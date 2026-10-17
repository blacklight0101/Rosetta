import { expect, it } from 'vitest';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { RunEndState } from '../../src/domain/runs/run-states.js';
import { sampleRun } from '../support/run-fixtures.js';
import { amyProject, runAmy, runBob, type FreshRuns } from './run-index.contract.js';

// RF-006, RF-1105: every RunIndex adapter (PgRunIndex, MemoryRunIndex) reopens an ended run that
// stopped at a cap, failed or was interrupted, once, for its owner only.

const unknownId = '00000000-0000-4000-b000-00000000ffff';

async function stored(index: RunIndex): Promise<Run> {
  const inserted = await index.insert(sampleRun({ userId: runAmy, projectId: amyProject }));
  if (!inserted.ok) throw new Error('The run was not stored');
  return inserted.value;
}

async function ended(index: RunIndex, endState: RunEndState): Promise<Run> {
  const run = await stored(index);
  await index.start(run.id, 5_000);
  const done = await index.end(run.id, endState, 9_000);
  if (done === undefined) throw new Error('The run did not end');
  return done;
}

function reopensTests(name: string, fresh: FreshRuns): void {
  it.each(['CapReached', 'Failed', 'Interrupted'] as const)(
    `RF-006 ${name} queues a run that ended %s again at the end of the queue, totals kept`,
    async (endState) => {
      const index = await fresh();
      const run = await ended(index, endState);

      const reopened = await index.reopen(runAmy, run.id, 20_000);

      expect(reopened).toEqual({
        ...run,
        queueState: 'Queued',
        endState: null,
        queuedAt: 20_000,
        startedAt: null,
        endedAt: null,
      });
      expect(await index.find(runAmy, run.id)).toEqual(reopened);
      expect((await index.listQueued()).map((each) => each.id)).toEqual([run.id]);
    },
  );

  it(`RF-006 ${name} reopens a run once: the second call finds it queued`, async () => {
    const index = await fresh();
    const run = await ended(index, 'CapReached');

    const first = await index.reopen(runAmy, run.id, 20_000);
    const second = await index.reopen(runAmy, run.id, 21_000);

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });
}

function refusesTests(name: string, fresh: FreshRuns): void {
  it(`RF-006 ${name} does not reopen a run that completed, or one that has not ended`, async () => {
    const index = await fresh();
    const completed = await ended(index, 'Completed');
    const queued = await stored(index);

    expect(await index.reopen(runAmy, completed.id, 20_000)).toBeUndefined();
    expect(await index.reopen(runAmy, queued.id, 20_000)).toBeUndefined();
    expect(await index.find(runAmy, completed.id)).toEqual(completed);
  });

  it(`RF-1105 ${name} does not reopen another user run, an unknown id or a bad id`, async () => {
    const index = await fresh();
    const run = await ended(index, 'CapReached');

    expect(await index.reopen(runBob, run.id, 20_000)).toBeUndefined();
    expect(await index.reopen(runAmy, unknownId, 20_000)).toBeUndefined();
    expect(await index.reopen(runAmy, 'not-a-uuid', 20_000)).toBeUndefined();
    expect(await index.find(runAmy, run.id)).toEqual(run);
  });
}

export function runIndexReopenContract(name: string, fresh: FreshRuns): void {
  reopensTests(name, fresh);
  refusesTests(name, fresh);
}
