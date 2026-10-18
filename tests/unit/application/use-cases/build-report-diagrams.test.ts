import { describe, expect, it } from 'vitest';
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

// RF-508: the report is given the diagrams of the run's documents: the specification and the data
// model of an understand run, the files of the hand-off package of a plan run.

const run: Run = sampleRun({
  userId: userAmy.userId,
  runKey: replayDemoRunKey,
  stage: 'understand',
  queueState: 'Ended',
  endState: 'Completed',
});

const fenced = (heading: string, source: string): string =>
  `## ${heading}\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`;

async function build(files: Readonly<Record<string, string>>) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const writer = new RecordingReportWriter();
  const report = new BuildReport({
    ...{ runs, manifests: new MemoryRunManifestStore(), history: new MemoryEventSink() },
    ...{ files: new MapRunTextFiles(files), writer, scans: new FixedScans([]) },
    ...{ logger: new RecordingLogger(), ...reportFigures() },
  });
  await report.execute({ actor: userAmy, runId: run.id });
  const model = writer.written[0]?.model;
  if (model === undefined) throw new Error('The report was not built.');
  return model;
}

describe('BuildReport and the diagrams', () => {
  it('RF-508 gives the report the diagrams of the specification and of the data model', async () => {
    const model = await build({
      'spec.md': fenced('Screens', 'flowchart LR\n  s1["Home"]'),
      'data-model.md': fenced('Entities', 'erDiagram\n  e1["Order"]'),
    });

    expect(model.diagrams).toEqual([
      { document: 'spec.md', title: 'Screens', source: 'flowchart LR\n  s1["Home"]' },
      { document: 'data-model.md', title: 'Entities', source: 'erDiagram\n  e1["Order"]' },
    ]);
  });

  it('RF-508 gives the report the diagrams of the hand-off package, flow files included', async () => {
    const model = await build({
      'handoff/architecture.md': fenced('Components', 'flowchart LR\n  c1["Web"]'),
      'handoff/trd.md': fenced('Architecture overview', 'flowchart LR\n  c1["Web"]'),
      'handoff/data-model.md': fenced('Target model', 'erDiagram\n  e1["Order"]'),
      'handoff/flows/README.md': '- [FLOW-001](FLOW-001.md): Check out\n',
      'handoff/flows/FLOW-001.md': fenced('Sequence', 'sequenceDiagram\n  participant p1 as Web'),
    });

    expect(model.diagrams?.map((diagram) => diagram.document)).toEqual([
      'handoff/architecture.md',
      'handoff/trd.md',
      'handoff/data-model.md',
      'handoff/flows/FLOW-001.md',
    ]);
  });

  it('RF-508 reads only the documents it names: a diagram in any other file is not drawn', async () => {
    const model = await build({
      'cards/FLOW/FLOW-001.md': fenced('Sequence', 'sequenceDiagram\n  a->>b: x'),
      'handoff/flows/FLOW-099.md': fenced('Sequence', 'sequenceDiagram\n  a->>b: x'),
    });

    expect(model.diagrams).toEqual([]);
  });

  it('RF-508 gives a run without documents an empty list', async () => {
    expect((await build({})).diagrams).toEqual([]);
  });
});
