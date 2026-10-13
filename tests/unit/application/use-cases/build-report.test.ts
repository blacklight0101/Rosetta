import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { RUN_END_STATES } from '../../../../src/domain/runs/run-states.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import type { ScanResults } from '../../../../src/application/ports/scan-results.js';
import { areaOf, FixedScans } from '../../../support/estimate-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { MapRunTextFiles, RecordingReportWriter } from '../../../support/report-doubles.js';
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
  readonly scans?: ScanResults;
  readonly otherRuns?: readonly Run[];
}

async function setup(run: Run, parts: Parts = {}) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  for (const other of parts.otherRuns ?? []) await runs.insert(other);
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
  const scans = parts.scans === undefined ? {} : { scans: parts.scans };
  const logger = new RecordingLogger();
  const build = new BuildReport({ runs, manifests, history, files, writer, logger, ...scans });
  return { build, writer, logger };
}

const request = (run: Run, actor: Actor = userAmy) => ({ actor, runId: run.id });

describe('BuildReport', () => {
  it('RF-504 builds the report of a finished run from its manifest, cards and events', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run);

    const result = await build.execute(request(run));

    expect(result).toEqual({
      ok: true,
      value: { files: ['report/report.md', 'report/report.html'] },
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

const ledger = { ...areaOf('LEDGER', 100), mapLevel: 'coarse' } as const;
const shop = { ...areaOf('shop', 200), mapLevel: 'symbols' } as const;
const scanRun = (overrides: Partial<Run> = {}): Run =>
  sampleRun({
    userId: userAmy.userId,
    stage: 'scan',
    queueState: 'Ended',
    endState: 'Completed',
    ...overrides,
  });

/** The scans of a test: the areas each scan run's code map has; records which ones were opened. */
class ScansByRun implements ScanResults {
  readonly opened: string[] = [];
  private readonly areas: Readonly<Record<string, readonly Area[]>>;

  constructor(areas: Readonly<Record<string, readonly Area[]>>) {
    this.areas = areas;
  }

  async open(scan: Run): ReturnType<ScanResults['open']> {
    this.opened.push(scan.id);
    return new FixedScans(this.areas[scan.id] ?? []).open(scan);
  }
}

describe('BuildReport and the map level', () => {
  it('RF-112 gives an understand run the map level of every area of its newest completed scan', async () => {
    const scans = new FixedScans([ledger, shop]);
    const scan = scanRun();
    const run = endedRun();
    const { build, writer } = await setup(run, { scans, otherRuns: [scan] });

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([
      { name: 'LEDGER', mapLevel: 'coarse' },
      { name: 'shop', mapLevel: 'symbols' },
    ]);
    expect(scans.opened.map((opened) => opened.id)).toEqual([scan.id]);
  });

  it('RF-112 uses the newest of two completed scans', async () => {
    const older = scanRun();
    const newer = scanRun();
    const scans = new ScansByRun({ [older.id]: [ledger], [newer.id]: [shop] });
    const run = endedRun();
    const { build, writer } = await setup(run, { scans, otherRuns: [older, newer] });

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([{ name: 'shop', mapLevel: 'symbols' }]);
  });

  it.each(['Failed', 'Interrupted', 'CapReached'] as const)(
    'RF-112 skips a newer scan that ended %s and uses the completed one',
    async (endState) => {
      const completed = scanRun();
      const spoiled = scanRun({ endState });
      const scans = new ScansByRun({ [completed.id]: [ledger], [spoiled.id]: [shop] });
      const run = endedRun();
      const { build, writer } = await setup(run, { scans, otherRuns: [completed, spoiled] });

      await build.execute(request(run));

      expect(writer.written[0]?.model.areas).toEqual([{ name: 'LEDGER', mapLevel: 'coarse' }]);
    },
  );

  it('RF-112 never uses the scan of another project of the same user', async () => {
    const own = scanRun();
    const elsewhere = scanRun({ projectId: '00000000-0000-4000-a000-0000000000ff' });
    const scans = new ScansByRun({ [own.id]: [ledger], [elsewhere.id]: [shop] });
    const run = endedRun();
    const { build, writer } = await setup(run, { scans, otherRuns: [own, elsewhere] });

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([{ name: 'LEDGER', mapLevel: 'coarse' }]);
    expect(scans.opened).toEqual([own.id]);
  });

  it('RF-112 builds the report without areas, and no scan opened, for a project that has only another project scan', async () => {
    const elsewhere = scanRun({ projectId: '00000000-0000-4000-a000-0000000000ff' });
    const scans = new ScansByRun({ [elsewhere.id]: [shop] });
    const run = endedRun();
    const { build, writer } = await setup(run, { scans, otherRuns: [elsewhere] });

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([]);
    expect(scans.opened).toEqual([]);
  });

  it('RF-112 gives a scan run its own map level', async () => {
    const scans = new FixedScans([ledger]);
    const run = scanRun({ runKey: replayDemoRunKey });
    const { build, writer } = await setup(run, { scans });

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([{ name: 'LEDGER', mapLevel: 'coarse' }]);
    expect(scans.opened.map((opened) => opened.id)).toEqual([run.id]);
  });

  it('RF-112 builds the report without areas when the project has no completed scan', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run, { scans: new FixedScans([ledger]) });

    const result = await build.execute(request(run));

    expect(result.ok).toBe(true);
    expect(writer.written[0]?.model.areas).toEqual([]);
  });

  it('RF-112 builds the report without areas when the scan output is gone', async () => {
    const gone: ScanResults = { open: () => Promise.reject(new Error('the snapshot is gone')) };
    const run = endedRun();
    const { build, writer, logger } = await setup(run, { scans: gone, otherRuns: [scanRun()] });

    const result = await build.execute(request(run));

    expect(result.ok).toBe(true);
    expect(writer.written[0]?.model.areas).toEqual([]);
    expect(logger.records).toEqual([
      expect.objectContaining({ level: 'warn', code: 'RST-1203', runId: run.id }),
    ]);
    expect(logger.text()).not.toContain('the snapshot is gone');
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
