import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import type { RunTextFiles } from '../../../../src/application/ports/run-text-files.js';
import { GetRun, type QueuePositions } from '../../../../src/application/use-cases/get-run.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-1002, RF-504, RF-1105 (P1-130): Get run gives the live run page the run and whether its report
// has been built, so the Report step of the stepper is done on load for a run whose report exists.
// Another user's run id and an unknown id give the same answer.

/** The run folders that hold a report, by run key; records every path asked for. */
class ReportFolders implements RunTextFiles {
  readonly asked: string[] = [];
  private readonly withReport: ReadonlySet<string>;

  constructor(withReport: readonly string[] = []) {
    this.withReport = new Set(withReport);
  }

  read(scope: RunScope, path: string): Promise<string | undefined> {
    this.asked.push(path);
    const found = this.withReport.has(scope.runKey) && path === 'report/report.md';
    return Promise.resolve(found ? '# Run report\n' : undefined);
  }
}

const endedRun = (runKey: string): Run =>
  sampleRun({ userId: userAmy.userId, runKey, queueState: 'Ended', endState: 'Completed' });

/** A queue that knows the positions it is given, and records every run it is asked about. */
class FakeQueue implements QueuePositions {
  readonly asked: string[] = [];
  private readonly positions: ReadonlyMap<string, number>;

  constructor(positions: ReadonlyMap<string, number> = new Map()) {
    this.positions = positions;
  }

  positionOf(runId: string): Promise<number | undefined> {
    this.asked.push(runId);
    return Promise.resolve(this.positions.get(runId));
  }
}

async function setup(
  run: Run,
  files: ReportFolders,
  queue: QueuePositions = new FakeQueue(),
): Promise<GetRun> {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  return new GetRun({ runs, files, queue });
}

describe('GetRun', () => {
  it('RF-1002 says the report is built for an ended run whose folder holds report/report.md', async () => {
    const run = endedRun('2026-10-12T10-00-00Z-understand');
    const getRun = await setup(run, new ReportFolders([run.runKey]));

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual({ ok: true, value: { run, reportBuilt: true, position: null } });
  });

  it('RF-1002 says the report is not built for an ended run without one', async () => {
    const run = endedRun('2026-10-12T10-00-00Z-understand');
    const getRun = await setup(run, new ReportFolders());

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual({ ok: true, value: { run, reportBuilt: false, position: null } });
  });

  it('RF-504 does not look for a report of a run that has not ended, which cannot have one', async () => {
    const run = runningRun({ userId: userAmy.userId });
    const files = new ReportFolders([run.runKey]);
    const getRun = await setup(run, files);

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual({ ok: true, value: { run, reportBuilt: false, position: null } });
    expect(files.asked).toEqual([]);
  });

  it('RF-1105 answers another user run like an unknown one, without reading its folder', async () => {
    const run = endedRun('2026-10-12T10-00-00Z-understand');
    const files = new ReportFolders([run.runKey]);
    const getRun = await setup(run, files);

    const other = await getRun.execute({ actor: userBob, runId: run.id });
    const unknown = await getRun.execute({ actor: userAmy, runId: 'not-a-run' });

    expect(other).toEqual({ ok: false, error: 'not-found' });
    expect(unknown).toEqual({ ok: false, error: 'not-found' });
    expect(files.asked).toEqual([]);
  });
});

describe('GetRun: the place in the queue', () => {
  it('RF-1108 gives a queued run the place the queue says it holds', async () => {
    const run = sampleRun({ userId: userAmy.userId });
    const getRun = await setup(run, new ReportFolders(), new FakeQueue(new Map([[run.id, 3]])));

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual({ ok: true, value: { run, reportBuilt: false, position: 3 } });
  });

  it('RF-1108 gives a queued run that the queue no longer holds no place', async () => {
    const run = sampleRun({ userId: userAmy.userId });
    const getRun = await setup(run, new ReportFolders());

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toMatchObject({ ok: true, value: { position: null } });
  });

  it('RF-1108 does not ask the queue about a run that is not queued', async () => {
    const run = runningRun({ userId: userAmy.userId });
    const queue = new FakeQueue(new Map([[run.id, 1]]));
    const getRun = await setup(run, new ReportFolders(), queue);

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toMatchObject({ ok: true, value: { position: null } });
    expect(queue.asked).toEqual([]);
  });

  it('RF-1105 does not ask the queue about another user run', async () => {
    const run = sampleRun({ userId: userAmy.userId });
    const queue = new FakeQueue(new Map([[run.id, 1]]));
    const getRun = await setup(run, new ReportFolders(), queue);

    await getRun.execute({ actor: userBob, runId: run.id });

    expect(queue.asked).toEqual([]);
  });
});
