import { describe, expect, it } from 'vitest';
import { serialiseOverview } from '../../../../src/application/overview/overview-file.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import { ReadOverview } from '../../../../src/application/use-cases/read-overview.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { fullOverview } from '../../../support/app-overview-fixtures.js';
import { FixedScans } from '../../../support/estimate-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import {
  MapRunTextFiles,
  RecordingReportWriter,
  reportFigures,
} from '../../../support/report-doubles.js';
import { replayDemoRunKey } from '../../../support/replay-fixture.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-264, RF-504, RF-1105: the run's `overview.json` reaches the run page (Read overview) and the
// report (Build report); another user's run id answers like an unknown one.

const run: Run = sampleRun({
  userId: userAmy.userId,
  runKey: replayDemoRunKey,
  stage: 'understand',
  queueState: 'Ended',
  endState: 'Completed',
  startedAt: 1,
  endedAt: 2,
});

async function indexed(): Promise<MemoryRunIndex> {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  return runs;
}

describe('ReadOverview', () => {
  it('RF-264 gives the owner the overview the run wrote', async () => {
    const files = new MapRunTextFiles({ 'overview.json': serialiseOverview(fullOverview()) });
    const read = new ReadOverview({ runs: await indexed(), files });

    const result = await read.execute({ actor: userAmy, runId: run.id });

    expect(result).toEqual({ ok: true, value: fullOverview() });
  });

  it('RF-264 gives undefined for a run without an overview or with a file that is not one', async () => {
    const runs = await indexed();

    const none = await new ReadOverview({ runs, files: new MapRunTextFiles() }).execute({
      actor: userAmy,
      runId: run.id,
    });
    const torn = await new ReadOverview({
      runs,
      files: new MapRunTextFiles({ 'overview.json': '{"schemaVersion": 1' }),
    }).execute({ actor: userAmy, runId: run.id });

    expect(none).toEqual({ ok: true, value: undefined });
    expect(torn).toEqual({ ok: true, value: undefined });
  });

  it("RF-1105 answers another user's run and an unknown one the same", async () => {
    const files = new MapRunTextFiles({ 'overview.json': serialiseOverview(fullOverview()) });
    const read = new ReadOverview({ runs: await indexed(), files });

    const other = await read.execute({ actor: userBob, runId: run.id });
    const unknown = await read.execute({ actor: userAmy, runId: 'no-such-run' });

    expect(other).toEqual({ ok: false, error: 'not-found' });
    expect(unknown).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('BuildReport and the overview', () => {
  async function built(files: Readonly<Record<string, string>>) {
    const writer = new RecordingReportWriter();
    const build = new BuildReport({
      ...{ runs: await indexed(), manifests: new MemoryRunManifestStore() },
      ...{ history: new MemoryEventSink(), files: new MapRunTextFiles(files), writer },
      ...{ scans: new FixedScans([]), logger: new RecordingLogger(), ...reportFigures() },
    });
    await build.execute({ actor: userAmy, runId: run.id });
    return writer.written[0]?.model;
  }

  it('RF-264 gives the report the overview of the run so it opens with it', async () => {
    const model = await built({ 'overview.json': serialiseOverview(fullOverview()) });

    expect(model?.overview).toEqual(fullOverview());
  });

  it('RF-264 builds the report of a run without an overview, as before', async () => {
    const model = await built({});

    expect(model?.overview).toBeUndefined();
  });
});
