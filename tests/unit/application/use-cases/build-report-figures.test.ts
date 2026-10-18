import { describe, expect, it } from 'vitest';
import { buildCostReport } from '../../../../src/application/budget/cost-report.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { costEntry } from '../../../support/cost-fixtures.js';
import { FixedScans } from '../../../support/estimate-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import {
  MapRunTextFiles,
  QuestionsByRun,
  RecordingReportWriter,
  reportFigures,
} from '../../../support/report-doubles.js';
import { replayDemoRunKey } from '../../../support/replay-fixture.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-500, RF-1010: the dashboard figures of the report model: the open questions of the run with
// their answers, its cost report, its coverage, and the totals of its project at generation time.

const run: Run = sampleRun({
  userId: userAmy.userId,
  runKey: replayDemoRunKey,
  stage: 'understand',
  queueState: 'Ended',
  endState: 'Completed',
});

const question = {
  cardId: 'OQ-001',
  question: 'Is stock checked?',
  context: 'a.cs:1-2 reads stock',
  answer: 'Yes.',
};

async function build(files: Readonly<Record<string, string>>, parts = reportFigures()) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const writer = new RecordingReportWriter();
  const report = new BuildReport({
    ...{ runs, manifests: new MemoryRunManifestStore(), history: new MemoryEventSink() },
    ...{ files: new MapRunTextFiles(files), writer, scans: new FixedScans([]) },
    ...{ logger: new RecordingLogger(), ...parts },
  });
  await report.execute({ actor: userAmy, runId: run.id });
  const model = writer.written[0]?.model;
  if (model === undefined) throw new Error('The report was not built.');
  return model;
}

describe('BuildReport and the open questions', () => {
  it('RF-500 gives the report the questions of the run, with their answers', async () => {
    const parts = { ...reportFigures(), answers: new QuestionsByRun({ [run.runKey]: [question] }) };

    const model = await build({}, parts);

    expect(model.questions).toEqual([question]);
  });

  it('RF-500 gives a run without questions an empty list', async () => {
    expect((await build({})).questions).toEqual([]);
  });
});

describe('BuildReport and the cost and coverage files', () => {
  it('RF-500 gives the report the cost report of the run', async () => {
    const costText = JSON.stringify(buildCostReport(run.runKey, [costEntry(userAmy.userId)]));

    const model = await build({ 'cost.json': costText });

    expect(model.cost?.totals).toMatchObject({ calls: 1, costMicros: 700, inputTokens: 1000 });
    expect(model.cost?.byRole.map((line) => line.key)).toEqual(['reader']);
  });

  it('RF-500 builds without a cost report when cost.json is missing or torn', async () => {
    expect((await build({})).cost).toBeNull();
    expect((await build({ 'cost.json': '{"schemaVersion":' })).cost).toBeNull();
  });

  it('RF-500 gives the report the coverage of the run', async () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      areas: [{ area: 'orders', files: [], tokens: 10, readTokens: 5, readTokenShare: 0.5 }],
    });

    const model = await build({ 'coverage.json': text });

    expect(model.coverage?.areas.map((each) => each.area)).toEqual(['orders']);
    expect(model.coverage?.readTokenShare).toBe(0.5);
  });

  it('RF-500 builds without coverage when coverage.json is missing', async () => {
    expect((await build({})).coverage).toBeNull();
  });
});

describe('BuildReport and the project totals', () => {
  it('RF-1010 sums the ledger of the run project, not of another project or user, at the time of the build', async () => {
    const parts = reportFigures();
    const mine = { userId: userAmy.userId, projectId: run.projectId };
    parts.costs.add(costEntry(mine.userId, { projectId: mine.projectId, costMicros: 700n }));
    parts.costs.add(costEntry(mine.userId, { projectId: mine.projectId, costMicros: 300n }));
    parts.costs.add(costEntry(mine.userId, { projectId: 'another-project', costMicros: 9n }));
    parts.costs.add(costEntry('another-user', { projectId: mine.projectId, costMicros: 9n }));

    const model = await build({}, parts);

    expect(model.generatedAt).toBe('2026-10-12T11:00:00.000Z');
    expect(model.projectTotals).toMatchObject({
      calls: 2,
      inputTokens: 2000,
      cost: [{ currency: 'USD', costMicros: 1000 }],
    });
  });

  it('RF-1010 states zero totals for a project that has spent nothing', async () => {
    const model = await build({});

    expect(model.projectTotals).toMatchObject({ calls: 0, cost: [] });
  });
});
