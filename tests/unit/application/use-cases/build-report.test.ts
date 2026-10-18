import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { RUN_END_STATES } from '../../../../src/domain/runs/run-states.js';
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
import {
  replayDemoEvents,
  replayDemoRunKey,
  replayDemoText,
} from '../../../support/replay-fixture.js';
import { runningRun, sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-504, RF-506, RF-1105: Build report gives the owner of a finished run its report files, built
// from the manifest, the events and the files of the run folder; another user's run id answers like
// an unknown one; a run in progress has no report yet.

const endedRun = (overrides: Partial<Run> = {}): Run =>
  sampleRun({
    userId: userAmy.userId,
    runKey: replayDemoRunKey,
    stage: 'understand',
    queueState: 'Ended',
    endState: 'Completed',
    startedAt: 1,
    endedAt: 2,
    ...overrides,
  });

interface Parts {
  readonly files?: Readonly<Record<string, string>>;
  readonly withManifest?: boolean;
  readonly withEvents?: boolean;
}

async function setup(run: Run, parts: Parts = {}) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const manifests = new MemoryRunManifestStore();
  if (parts.withManifest !== false) {
    await manifests.write(
      scopeOf(run),
      sampleManifest({
        runId: run.runKey,
        stage: 'understand',
        endState: 'Completed',
        startedAt: '2026-10-12T10:00:00.000Z',
        endedAt: '2026-10-12T10:00:48.000Z',
        totals: {
          inputTokens: 3600,
          outputTokens: 330,
          cachedInputTokens: 0,
          costMicros: 4000,
          calls: 3,
        },
        source: {
          url: 'https://github.com/octo/demo',
          owner: 'octo',
          repo: 'demo',
          ref: 'main',
          commitSha: '3f786850e387550fdab836ed7e6dc881de23001b',
          subpath: '',
          snapshotHash: null,
        },
      }),
    );
  }
  const history = new MemoryEventSink();
  if (parts.withEvents !== false) {
    for (const event of await replayDemoEvents()) await history.publish(scopeOf(run), event);
  }
  const writer = new RecordingReportWriter();
  const files = new MapRunTextFiles(
    parts.files ?? {
      'cards/index.json': await replayDemoText('cards/index.json'),
      'spec.md': '# Specification\n',
      'cost.md': '# Cost\n',
    },
  );
  const build = new BuildReport({
    ...{ runs, manifests, history, files, writer },
    ...{ scans: new FixedScans([]), logger: new RecordingLogger(), ...reportFigures() },
  });
  return { build, writer };
}

const request = (run: Run, actor: Actor = userAmy) => ({ actor, runId: run.id });

describe('BuildReport', () => {
  it('RF-504 builds the report of a finished run from its manifest, cards and events', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run);

    const result = await build.execute(request(run));

    expect(result).toEqual({
      ok: true,
      value: {
        files: ['report/report.md', 'report/report.html', `report/${replayDemoRunKey}.zip`],
      },
    });
    const [written] = writer.written;
    expect(written?.scope).toEqual(scopeOf(run));
    expect(written?.model).toMatchObject({
      runKey: replayDemoRunKey,
      stage: 'understand',
      endState: 'Completed',
      startedAt: '2026-10-12T10:00:00.000Z',
      endedAt: '2026-10-12T10:00:48.000Z',
      source: {
        url: 'https://github.com/octo/demo',
        commitSha: '3f786850e387550fdab836ed7e6dc881de23001b',
      },
      totals: { inputTokens: 3600, outputTokens: 330, costMicros: 4000, calls: 3 },
    });
    expect(written?.model.cards.map((card) => card.id)).toEqual(['BR-001']);
  });
});

describe('BuildReport replay and end states', () => {
  it('RF-506 gives the report the replay of the events', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run);

    await build.execute(request(run));

    const replay = writer.written[0]?.model.replay;
    expect(replay?.runKey).toBe(replayDemoRunKey);
    expect(replay?.steps).toHaveLength(24);
    expect(replay?.agents.map((agent) => agent.area)).toEqual(['orders', 'catalog']);
  });

  it.each(RUN_END_STATES)(
    'RF-504 builds the report of a run that ended as %s',
    async (endState) => {
      const run = endedRun({ endState });
      const { build, writer } = await setup(run);

      const result = await build.execute(request(run));

      expect(result.ok).toBe(true);
      expect(writer.written).toHaveLength(1);
    },
  );
});

describe('BuildReport and the run folder', () => {
  it('RF-504 lists only the documents the run folder has', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run, { files: { 'spec.md': '# Specification\n' } });

    await build.execute(request(run));

    expect(writer.written[0]?.model.documents).toEqual({
      spec: true,
      coverage: false,
      cost: false,
    });
    expect(writer.written[0]?.model.cards).toEqual([]);
  });

  it('RF-504 links the coverage report when the run has one', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run, { files: { 'coverage.md': '# Coverage\n' } });

    await build.execute(request(run));

    expect(writer.written[0]?.model.documents.coverage).toBe(true);
  });

  it('RF-504 still builds for a run with no manifest and no events', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run, { withManifest: false, withEvents: false });

    const result = await build.execute(request(run));

    expect(result.ok).toBe(true);
    expect(writer.written[0]?.model).toMatchObject({
      runKey: replayDemoRunKey,
      stage: 'understand',
      endState: 'Completed',
      source: null,
      totals: null,
    });
    expect(writer.written[0]?.model.replay.steps).toEqual([]);
  });
});

describe('BuildReport and access', () => {
  it("RF-1105 answers not-found for another user's run, like an unknown one, and writes nothing", async () => {
    const run = endedRun();
    const { build, writer } = await setup(run);

    const other = await build.execute(request(run, userBob));
    const unknown = await build.execute({ actor: userAmy, runId: 'not-a-run' });

    expect(other).toEqual({ ok: false, error: 'not-found' });
    expect(unknown).toEqual(other);
    expect(writer.written).toEqual([]);
  });

  it.each([
    ['running', runningRun({ userId: userAmy.userId })],
    ['queued', sampleRun({ userId: userAmy.userId })],
  ])('RF-504 answers in-progress for a %s run and writes nothing', async (_name, run) => {
    const { build, writer } = await setup(run, { withEvents: false });

    const result = await build.execute(request(run));

    expect(result).toEqual({ ok: false, error: 'in-progress' });
    expect(writer.written).toEqual([]);
  });
});
