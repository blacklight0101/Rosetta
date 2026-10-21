import { describe, expect, it } from 'vitest';
import type { ScanResults } from '../../../../src/application/ports/scan-results.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { areaOf, FixedScans } from '../../../support/estimate-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import {
  MapRunTextFiles,
  RecordingReportWriter,
  reportFigures,
} from '../../../support/report-doubles.js';
import { replayDemoRunKey } from '../../../support/replay-fixture.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-112: the report states the map level of every area. The areas come from the run's own scan, or
// from the newest scan of the same project that ended Completed: never an older one, never one that
// failed or was stopped, never another project's. A scan output that cannot be read is logged with
// its code and the report is built without areas.

const endedRun = (overrides: Partial<Run> = {}): Run =>
  sampleRun({
    userId: userAmy.userId,
    runKey: replayDemoRunKey,
    stage: 'understand',
    queueState: 'Ended',
    endState: 'Completed',
    ...overrides,
  });

async function setup(run: Run, scans: ScanResults, otherRuns: readonly Run[] = []) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  for (const other of otherRuns) await runs.insert(other);
  const writer = new RecordingReportWriter();
  const logger = new RecordingLogger();
  const build = new BuildReport({
    ...{ runs, manifests: new MemoryRunManifestStore(), history: new MemoryEventSink() },
    ...{ files: new MapRunTextFiles({}), writer, logger, scans, ...reportFigures() },
  });
  return { build, writer, logger };
}

const request = (run: Run) => ({ actor: userAmy, runId: run.id });
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

describe('BuildReport and the newest completed scan', () => {
  it('RF-112 gives an understand run the map level of every area of its newest completed scan', async () => {
    const scans = new FixedScans([ledger, shop]);
    const scan = scanRun();
    const run = endedRun();
    const { build, writer } = await setup(run, scans, [scan]);

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
    const { build, writer } = await setup(run, scans, [older, newer]);

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
      const { build, writer } = await setup(run, scans, [completed, spoiled]);

      await build.execute(request(run));

      expect(writer.written[0]?.model.areas).toEqual([{ name: 'LEDGER', mapLevel: 'coarse' }]);
    },
  );
});

describe('BuildReport and the project of the scan', () => {
  it('RF-112 never uses the scan of another project of the same user', async () => {
    const own = scanRun();
    const elsewhere = scanRun({ projectId: '00000000-0000-4000-a000-0000000000ff' });
    const scans = new ScansByRun({ [own.id]: [ledger], [elsewhere.id]: [shop] });
    const run = endedRun();
    const { build, writer } = await setup(run, scans, [own, elsewhere]);

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([{ name: 'LEDGER', mapLevel: 'coarse' }]);
    expect(scans.opened).toEqual([own.id]);
  });

  it('RF-112 builds the report without areas, and no scan opened, for a project that has only another project scan', async () => {
    const elsewhere = scanRun({ projectId: '00000000-0000-4000-a000-0000000000ff' });
    const scans = new ScansByRun({ [elsewhere.id]: [shop] });
    const run = endedRun();
    const { build, writer } = await setup(run, scans, [elsewhere]);

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([]);
    expect(scans.opened).toEqual([]);
  });
});

describe('BuildReport and a scan that is the run itself or missing', () => {
  it('RF-112 gives a scan run its own map level', async () => {
    const scans = new FixedScans([ledger]);
    const run = scanRun({ runKey: replayDemoRunKey });
    const { build, writer } = await setup(run, scans);

    await build.execute(request(run));

    expect(writer.written[0]?.model.areas).toEqual([{ name: 'LEDGER', mapLevel: 'coarse' }]);
    expect(scans.opened.map((opened) => opened.id)).toEqual([run.id]);
  });

  it('RF-112 builds the report without areas when the project has no completed scan', async () => {
    const run = endedRun();
    const { build, writer } = await setup(run, new FixedScans([ledger]));

    const result = await build.execute(request(run));

    expect(result.ok).toBe(true);
    expect(writer.written[0]?.model.areas).toEqual([]);
  });

  it('RF-112 logs the code and builds without areas when the scan output is gone', async () => {
    const gone: ScanResults = { open: () => Promise.reject(new Error('the snapshot is gone')) };
    const run = endedRun();
    const { build, writer, logger } = await setup(run, gone, [scanRun()]);

    const result = await build.execute(request(run));

    expect(result.ok).toBe(true);
    expect(writer.written[0]?.model.areas).toEqual([]);
    expect(logger.records).toEqual([
      expect.objectContaining({ level: 'warn', code: 'RST-1203', runId: run.id }),
    ]);
    expect(logger.text()).not.toContain('the snapshot is gone');
  });
});

describe('BuildReport and the areas of a workbook project (Q-49)', () => {
  const workbookKey = `workbook__${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}@${'a'.repeat(16)}`;
  const root = { ...areaOf('(root)', 10), files: ['dependencies.md'] };
  const loan = { ...areaOf('Loan.xlsx', 100), files: ['Loan.xlsx/workbook.md'] };
  const rates = { ...areaOf('Rates.xlsx', 100), files: ['Rates.xlsx/workbook.md'] };

  async function namesFor(areas: readonly Area[], folders: readonly string[]) {
    const scans = new FixedScans(areas, [], folders, workbookKey);
    const run = endedRun();
    const { build, writer } = await setup(run, scans, [scanRun()]);

    await build.execute(request(run));

    return writer.written[0]?.model.areas.map((area) => area.name);
  }

  it('RF-231 lists no (root) area for a single workbook', async () => {
    expect(await namesFor([loan, root], ['Loan.xlsx'])).toEqual(['Loan.xlsx']);
  });

  it('RF-231 lists the (root) area for two workbooks', async () => {
    expect(await namesFor([loan, rates, root], ['Loan.xlsx', 'Rates.xlsx'])).toEqual([
      'Loan.xlsx',
      'Rates.xlsx',
      '(root)',
    ]);
  });
});
