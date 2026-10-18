import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { FixedScans } from '../../../support/estimate-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import {
  MapRunTextFiles,
  RecordingReportWriter,
  reportFigures,
} from '../../../support/report-doubles.js';
import { replayDemoRunKey } from '../../../support/replay-fixture.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-505: Build report offers "Download all": the zip of the run, and the zip of the hand-off
// package only when the run has one. It tells the report writer which zips the dashboard links and
// asks for them to be written beside the pages once the pages exist.

const run: Run = sampleRun({
  userId: userAmy.userId,
  runKey: replayDemoRunKey,
  stage: 'plan',
  queueState: 'Ended',
  endState: 'Completed',
});

async function build(files: Readonly<Record<string, string>>) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const writer = new RecordingReportWriter();
  const figures = reportFigures();
  const report = new BuildReport({
    ...{ runs, manifests: new MemoryRunManifestStore(), history: new MemoryEventSink() },
    ...{ files: new MapRunTextFiles(files), writer, scans: new FixedScans([]) },
    ...{ logger: new RecordingLogger(), ...figures },
  });
  const result = await report.execute({ actor: userAmy, runId: run.id });
  return { result, writer, downloads: figures.downloads };
}

describe('BuildReport and the downloads', () => {
  it('RF-505 links the zip of the run alone when the run has no hand-off package', async () => {
    const { writer, downloads } = await build({ 'spec.md': '# Specification\n' });

    expect(writer.written[0]?.model.downloads).toEqual({ run: `${replayDemoRunKey}.zip` });
    expect(downloads.written).toEqual([
      { scope: scopeOf(run), names: { run: `${replayDemoRunKey}.zip` } },
    ]);
  });

  it('RF-505 links the zip of the hand-off package as well when the run has one', async () => {
    const { writer, downloads } = await build({ 'handoff/README.md': '# Hand-off\n' });

    const names = { run: `${replayDemoRunKey}.zip`, handoff: `${replayDemoRunKey}-handoff.zip` };
    expect(writer.written[0]?.model.downloads).toEqual(names);
    expect(downloads.written.map((each) => each.names)).toEqual([names]);
  });

  it('RF-505 lists the zips among the files written, after the pages', async () => {
    const { result } = await build({ 'handoff/README.md': '# Hand-off\n' });

    expect(result).toEqual({
      ok: true,
      value: {
        files: [
          'report/report.md',
          'report/report.html',
          `report/${replayDemoRunKey}.zip`,
          `report/${replayDemoRunKey}-handoff.zip`,
        ],
      },
    });
  });
});
