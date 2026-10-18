import { describe, expect, it } from 'vitest';
import type { ScanResults } from '../../../../src/application/ports/scan-results.js';
import type { CardFile } from '../../../../src/application/report/card-evidence.js';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { BuildReport } from '../../../../src/application/use-cases/build-report.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { FixedScans } from '../../../support/estimate-harness.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import {
  FixedReportCards,
  MapRunTextFiles,
  RecordingReportWriter,
  reportFigures,
} from '../../../support/report-doubles.js';
import { replayDemoRunKey, replayDemoText } from '../../../support/replay-fixture.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-502, RF-125: Build report gives the pages of the cards their evidence: it reads the card files
// the index lists and, through the reader of the scan the run built on, the lines each claim cites.
// Without a readable snapshot the cards still have their pages, with a reason in place of the lines.

const endedRun = sampleRun({
  userId: userAmy.userId,
  runKey: replayDemoRunKey,
  stage: 'understand',
  queueState: 'Ended',
  endState: 'Completed',
});
const scanRun = sampleRun({
  userId: userAmy.userId,
  stage: 'scan',
  queueState: 'Ended',
  endState: 'Completed',
});

const card: CardFile = {
  id: 'BR-001',
  type: 'BR',
  title: 'Order checkout',
  summary: 'x',
  area: 'orders',
  confidence: 'High',
  claims: [
    {
      claimId: 'BR-001.c1',
      text: 'A claim.',
      status: 'Supported',
      reason: 'It holds.',
      citations: [{ path: 'Orders/Checkout.cs', startLine: 5, endLine: 6 }],
    },
  ],
};

const source = Array.from({ length: 20 }, (_, index) => `code ${String(index + 1)}`).join('\n');

class ScansWithFiles implements ScanResults {
  async open(scan: Run): ReturnType<ScanResults['open']> {
    const opened = await new FixedScans([]).open(scan);
    return { ...opened, reader: new MemoryRepositoryReader({ 'Orders/Checkout.cs': source }) };
  }
}

class BrokenScans implements ScanResults {
  open(): ReturnType<ScanResults['open']> {
    return Promise.reject(new RosettaError(ERROR_CODES.codeMapMissing, 'The snapshot is gone.'));
  }
}

async function setup(scans: ScanResults, runs: readonly Run[] = [endedRun, scanRun]) {
  const index = new MemoryRunIndex();
  for (const run of runs) await index.insert(run);
  const manifests = new MemoryRunManifestStore();
  await manifests.write(scopeOf(endedRun), sampleManifest({ runId: replayDemoRunKey }));
  const writer = new RecordingReportWriter();
  const logger = new RecordingLogger();
  const cards = new FixedReportCards([card]);
  const build = new BuildReport({
    ...{ runs: index, manifests, history: new MemoryEventSink(), writer, logger, scans },
    ...{ files: reportFiles(await replayDemoText('cards/index.json')) },
    ...{ ...reportFigures(), cards },
  });
  return { build, writer, logger, cards };
}

const reportFiles = (cardIndex: string): MapRunTextFiles =>
  new MapRunTextFiles({ 'cards/index.json': cardIndex });

const request = { actor: userAmy, runId: endedRun.id };

describe('BuildReport and the evidence of the cards', () => {
  it('RF-502 reads the card files the index lists, by their paths', async () => {
    const { build, cards } = await setup(new ScansWithFiles());

    await build.execute(request);

    expect(cards.asked).toEqual([['cards/BR/BR-001.md']]);
  });

  it('RF-502 gives the model the cited lines of each claim, with context, read from the scan snapshot', async () => {
    const { build, writer } = await setup(new ScansWithFiles());

    await build.execute(request);

    const [detail] = writer.written[0]?.model.cardDetails ?? [];
    expect(detail?.claims[0]?.citations[0]).toEqual({
      path: 'Orders/Checkout.cs',
      startLine: 5,
      endLine: 6,
      excerpt: {
        kind: 'lines',
        firstLine: 2,
        lines: ['code 2', 'code 3', 'code 4', 'code 5', 'code 6', 'code 7', 'code 8', 'code 9'],
      },
    });
    expect(detail?.claims[0]).toMatchObject({ status: 'Supported', reason: 'It holds.' });
  });
});

describe('BuildReport and a snapshot that is not there', () => {
  it('RF-502 builds the pages without lines, and says why, when the run has no completed scan', async () => {
    const { build, writer } = await setup(new ScansWithFiles(), [endedRun]);

    await build.execute(request);

    const [detail] = writer.written[0]?.model.cardDetails ?? [];
    expect(detail?.claims[0]?.citations[0]?.excerpt).toMatchObject({ kind: 'unavailable' });
  });

  it('RF-502 builds the pages without lines, and logs why, when the snapshot of the scan is gone', async () => {
    const { build, writer, logger } = await setup(new BrokenScans());

    const result = await build.execute(request);

    expect(result.ok).toBe(true);
    const [detail] = writer.written[0]?.model.cardDetails ?? [];
    expect(detail?.claims[0]?.citations[0]?.excerpt).toMatchObject({ kind: 'unavailable' });
    expect(logger.records.map((record) => record.code)).toContain(ERROR_CODES.codeMapMissing);
  });

  it('RF-502 opens the scan once for the areas and the evidence together', async () => {
    const scans = new FixedScans([]);
    const { build } = await setup(scans);

    await build.execute(request);

    expect(scans.opened).toHaveLength(1);
  });
});
