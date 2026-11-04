import { describe, expect, it } from 'vitest';
import type { RunTextFiles } from '../../../../src/application/ports/run-text-files.js';
import {
  COVERAGE_MAX_BYTES,
  ReadRunPartlyRead,
} from '../../../../src/application/use-cases/read-run-partly-read.js';
import type { ListingMeasures } from '../../../../src/application/use-cases/read-understanding.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MapRunTextFiles } from '../../../support/report-doubles.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-230, RF-1008, DEC-220 (P8-130): what the lists need of a run to read the state its page reads:
// how many areas are below the coverage bar and the share of the code read. One bad run never takes
// the list down: it keeps its plain state.

const area = (name: string, firstPartyShare?: number) => ({
  area: name,
  files: [],
  ...(firstPartyShare === undefined ? {} : { firstPartyShare }),
});
const coverage = (...areas: readonly ReturnType<typeof area>[]): string =>
  JSON.stringify({ schemaVersion: 1, areas });
const ended = (change: Partial<Run> = {}): Run =>
  sampleRun({
    ...{ userId: userAmy.userId, stage: 'understand', queueState: 'Ended', endState: 'Completed' },
    ...change,
  });
const nothing = { areas: 0, share: null };

interface Behaviour {
  readonly share?: number | null | 'throws';
  readonly library?: readonly string[] | 'throws';
}

function measuresOf(behaviour: Behaviour, asked: string[] = []): ListingMeasures {
  const { share = 0.16, library = [] } = behaviour;
  return {
    libraryAreas: () =>
      library === 'throws'
        ? Promise.reject(new Error('the scan is gone'))
        : Promise.resolve(new Set(library)),
    firstPartyShare: (run) => {
      asked.push(run.id);
      return share === 'throws'
        ? Promise.reject(new Error('the results are torn'))
        : Promise.resolve(share);
    },
  };
}

function readerOver(files: RunTextFiles, behaviour: Behaviour = {}) {
  const asked: string[] = [];
  const listings: (readonly Run[])[] = [];
  const logger = new RecordingLogger();
  const reader = new ReadRunPartlyRead({
    files,
    logger,
    understanding: {
      forListing: (runs) => {
        listings.push(runs);
        return measuresOf(behaviour, asked);
      },
    },
  });
  return { reader, asked, listings, logger };
}

function readerOf(files: Record<string, string>, behaviour: Behaviour = {}) {
  return readerOver(new MapRunTextFiles(files), behaviour);
}

describe('ReadRunPartlyRead: areas below the bar', () => {
  it('RF-230 gives the areas below the bar and the share of the code read', async () => {
    const { reader } = readerOf({ 'coverage.json': coverage(area('A', 0.16), area('B', 0.9)) });
    const run = ended();

    const read = await reader.forListing([run]).of(run);

    expect(read).toEqual({ areas: 1, share: 0.16 });
  });

  it('RF-230 reads a capped run the same way', async () => {
    const { reader } = readerOf({ 'coverage.json': coverage(area('A', 0.5)) });
    const run = ended({ endState: 'CapReached' });

    expect(await reader.forListing([run]).of(run)).toEqual({ areas: 1, share: 0.16 });
  });

  it('RF-230 gives no share when the measures of the run cannot be worked out', async () => {
    const { reader } = readerOf({ 'coverage.json': coverage(area('A', 0.2)) }, { share: null });
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual({ areas: 1, share: null });
  });

  it('RF-230 keeps a run whose areas are all at the bar, and works out no share for it', async () => {
    const { reader, asked } = readerOf({
      'coverage.json': coverage(area('A', 0.8), area('B', 1)),
    });
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual(nothing);
    expect(asked).toEqual([]);
  });

  it('RF-230 hands the runs of the whole listing to the measures once, not once per row', async () => {
    const { reader, listings } = readerOf({ 'coverage.json': coverage(area('A', 0.1)) });
    const runs = [ended({ runKey: 'one' }), ended({ runKey: 'two' })];

    const rows = reader.forListing(runs);
    for (const run of runs) await rows.of(run);

    expect(listings).toEqual([runs]);
  });
});

describe('ReadRunPartlyRead: library areas (P8-130, the rule of the run page)', () => {
  it('RF-230 does not count an area the code map calls third-party, whatever its share', async () => {
    const files = { 'coverage.json': coverage(area('Scripts', 0.1), area('src', 0.2)) };
    const { reader } = readerOf(files, { library: ['Scripts'] });
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual({ areas: 1, share: 0.16 });
  });

  it('RF-230 keeps the state of a run whose only area below the bar is a library area', async () => {
    const { reader, asked } = readerOf(
      { 'coverage.json': coverage(area('Scripts', 0.1), area('src', 0.9)) },
      { library: ['Scripts'] },
    );
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual(nothing);
    expect(asked).toEqual([]);
  });

  it('RF-230 counts every area when the scan cannot be opened, as the page does without a code map', async () => {
    const { reader, logger } = readerOf(
      { 'coverage.json': coverage(area('Scripts', 0.1)) },
      { library: 'throws' },
    );
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual({ areas: 1, share: 0.16 });
    expect(logger.records.map((record) => record.level)).toEqual(['warn']);
  });
});

describe('ReadRunPartlyRead: runs that keep their state', () => {
  it.each([
    ['no coverage file', {}],
    ['a torn coverage file', { 'coverage.json': '{"schemaVersion":1,"ar' }],
    ['an old coverage file without shares', { 'coverage.json': coverage(area('A')) }],
  ])('RF-230 makes no claim for a run with %s', async (_name, files) => {
    const { reader } = readerOf(files);
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual(nothing);
  });

  it.each([
    ['a scan', { stage: 'scan' }],
    ['a plan', { stage: 'plan' }],
    ['a run that failed', { endState: 'Failed' }],
    ['a run that was interrupted', { endState: 'Interrupted' }],
    ['a run that has not ended', { queueState: 'Running', endState: null }],
  ] as const)('RF-230 keeps the state of %s', async (_name, change) => {
    const { reader, asked } = readerOf({ 'coverage.json': coverage(area('A', 0.1)) });
    const run = ended(change);

    expect(await reader.forListing([run]).of(run)).toEqual(nothing);
    expect(asked).toEqual([]);
  });
});

describe('ReadRunPartlyRead: a run that cannot be read does not fail the list (P8-130)', () => {
  it('RF-230 RF-1008 keeps the plain state of a run whose coverage file cannot be read, and logs it', async () => {
    const unreadable = { read: () => Promise.reject(new Error('EISDIR: a directory')) };
    const { reader, logger } = readerOver(unreadable);
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual(nothing);
    expect(logger.records).toMatchObject([
      { level: 'warn', logger: 'history', runId: run.runKey, userId: run.userId },
    ]);
  });

  it('RF-230 RF-1008 keeps "Partly read" without a share when the results of the run are torn, as its page does', async () => {
    const { reader, logger } = readerOf(
      { 'coverage.json': coverage(area('A', 0.2)) },
      { share: 'throws' },
    );
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual({ areas: 1, share: null });
    expect(logger.records.map((record) => record.level)).toEqual(['warn']);
  });

  it('RF-230 never logs the text of the coverage file', async () => {
    const { reader, logger } = readerOf(
      { 'coverage.json': coverage(area('A', 0.2)) },
      { share: 'throws' },
    );
    const run = ended();

    await reader.forListing([run]).of(run);

    expect(logger.text()).not.toContain('"areas"');
  });
});

describe('ReadRunPartlyRead: the size of the coverage file is bounded (P8-130)', () => {
  it('RF-230 RF-1008 asks for the coverage file with a size limit', async () => {
    const asked: (number | undefined)[] = [];
    const files: RunTextFiles = {
      read: (_scope, _path, maxBytes) => {
        asked.push(maxBytes);
        return Promise.resolve(undefined);
      },
    };
    const { reader } = readerOver(files);
    const run = ended();

    await reader.forListing([run]).of(run);

    expect(asked).toEqual([COVERAGE_MAX_BYTES]);
  });

  it('RF-230 RF-1008 keeps the plain state of a run whose coverage file is over the limit', async () => {
    const big = coverage(area('A', 0.1)).padEnd(COVERAGE_MAX_BYTES + 1, ' ');
    const { reader, asked } = readerOf({ 'coverage.json': big });
    const run = ended();

    expect(await reader.forListing([run]).of(run)).toEqual(nothing);
    expect(asked).toEqual([]);
  });
});
