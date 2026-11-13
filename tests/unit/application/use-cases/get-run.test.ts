import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import type { RunTextFiles } from '../../../../src/application/ports/run-text-files.js';
import { GetRun, type QueuePositions } from '../../../../src/application/use-cases/get-run.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { runningRun, sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
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

/** P8-11: what a run with no manifest records. */
const plain = { cloudConsent: false, sourceRunId: null } as const;

const found = (run: Run, reportBuilt: boolean, position: number | null) => ({
  ok: true,
  value: { run, reportBuilt, position, waitsFor: null, ...plain },
});

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
  others: readonly Run[] = [],
): Promise<GetRun> {
  const runs = new MemoryRunIndex();
  for (const each of [run, ...others]) await runs.insert(each);
  return new GetRun({ runs, files, queue });
}

describe('GetRun', () => {
  it('RF-1002 says the report is built for an ended run whose folder holds report/report.md', async () => {
    const run = endedRun('2026-10-12T10-00-00Z-understand');
    const getRun = await setup(run, new ReportFolders([run.runKey]));

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual(found(run, true, null));
  });

  it('RF-1002 says the report is not built for an ended run without one', async () => {
    const run = endedRun('2026-10-12T10-00-00Z-understand');
    const getRun = await setup(run, new ReportFolders());

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual(found(run, false, null));
  });

  it('RF-504 does not look for a report of a run that has not ended, which cannot have one', async () => {
    const run = runningRun({ userId: userAmy.userId });
    const files = new ReportFolders([run.runKey]);
    const getRun = await setup(run, files);

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual(found(run, false, null));
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

describe('GetRun: the run a queued run waits for', () => {
  it('RF-1108 EV-106 names the user running run that holds the queued run', async () => {
    const holder = runningRun({
      userId: userAmy.userId,
      stage: 'understand',
      runKey: '2026-11-09T10-00-00Z-understand',
    });
    const run = sampleRun({ userId: userAmy.userId, stage: 'plan' });
    const getRun = await setup(run, new ReportFolders(), new FakeQueue(new Map([[run.id, 1]])), [
      holder,
    ]);

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual({
      ok: true,
      value: {
        run,
        reportBuilt: false,
        position: 1,
        waitsFor: { id: holder.id, runId: holder.runKey },
        ...plain,
      },
    });
  });
});

describe('GetRun: the place in the queue', () => {
  it('RF-1108 gives a queued run the place the queue says it holds', async () => {
    const run = sampleRun({ userId: userAmy.userId });
    const getRun = await setup(run, new ReportFolders(), new FakeQueue(new Map([[run.id, 3]])));

    const outcome = await getRun.execute({ actor: userAmy, runId: run.id });

    expect(outcome).toEqual(found(run, false, 3));
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

// P8-11 (P7-38, P7-25): the run row also carries the cloud consent the run recorded and, for a plan
// run, the understand run it was made from, so the page can show the consent box at once and "Try the
// plan again" can keep the source run.
describe('GetRun and the manifest options', () => {
  async function detailWith(options: Record<string, unknown> | undefined) {
    const run = endedRun('2026-10-12T10-00-00Z-understand');
    const runs = new MemoryRunIndex();
    await runs.insert(run);
    const manifests = new MemoryRunManifestStore();
    if (options !== undefined) {
      await manifests.write(scopeOf(run), sampleManifest({ options }));
    }
    const outcome = await new GetRun({
      ...{ runs, queue: new FakeQueue(), files: new ReportFolders(), manifests },
    }).execute({ actor: userAmy, runId: run.id });
    if (!outcome.ok) throw new Error('not found');
    return outcome.value;
  }

  it('P8-11 gives the consent and the source run the manifest records', async () => {
    const detail = await detailWith({ cloudConsent: true, sourceRunId: 'run-9' });

    expect(detail).toMatchObject({ cloudConsent: true, sourceRunId: 'run-9' });
  });

  it('P8-11 reads no consent and no source run from a run without a manifest', async () => {
    const detail = await detailWith(undefined);

    expect(detail).toMatchObject({ cloudConsent: false, sourceRunId: null });
  });
});
