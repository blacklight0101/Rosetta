import { describe, expect, it } from 'vitest';
import { ReadRunPartlyRead } from '../../../../src/application/use-cases/read-run-partly-read.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MapRunTextFiles } from '../../../support/report-doubles.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-230, RF-1008, DEC-220 (P8-130): what the lists need of a run to read the state its page reads:
// how many areas are below the coverage bar and the share of the code read.

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

function readerOf(files: Record<string, string>, share: number | null = 0.16) {
  const asked: string[] = [];
  const reader = new ReadRunPartlyRead({
    files: new MapRunTextFiles(files),
    share: (_actor, run) => {
      asked.push(run.id);
      return Promise.resolve(share);
    },
  });
  return { reader, asked };
}

describe('ReadRunPartlyRead: areas below the bar', () => {
  it('RF-230 gives the areas below the bar and the share of the code read', async () => {
    const { reader } = readerOf({ 'coverage.json': coverage(area('A', 0.16), area('B', 0.9)) });

    const read = await reader.execute({ actor: userAmy, run: ended() });

    expect(read).toEqual({ areas: 1, share: 0.16 });
  });

  it('RF-230 reads a capped run the same way', async () => {
    const { reader } = readerOf({ 'coverage.json': coverage(area('A', 0.5)) });

    const read = await reader.execute({ actor: userAmy, run: ended({ endState: 'CapReached' }) });

    expect(read).toEqual({ areas: 1, share: 0.16 });
  });

  it('RF-230 gives no share when the measures of the run cannot be worked out', async () => {
    const { reader } = readerOf({ 'coverage.json': coverage(area('A', 0.2)) }, null);

    const read = await reader.execute({ actor: userAmy, run: ended() });

    expect(read).toEqual({ areas: 1, share: null });
  });

  it('RF-230 keeps a run whose areas are all at the bar, and works out no share for it', async () => {
    const { reader, asked } = readerOf({ 'coverage.json': coverage(area('A', 0.8), area('B', 1)) });

    expect(await reader.execute({ actor: userAmy, run: ended() })).toEqual(nothing);
    expect(asked).toEqual([]);
  });
});

describe('ReadRunPartlyRead: runs that keep their state', () => {
  it.each([
    ['no coverage file', {}],
    ['a torn coverage file', { 'coverage.json': '{"schemaVersion":1,"ar' }],
    ['an old coverage file without shares', { 'coverage.json': coverage(area('A')) }],
  ])('RF-230 makes no claim for a run with %s', async (_name, files) => {
    const { reader } = readerOf(files);

    expect(await reader.execute({ actor: userAmy, run: ended() })).toEqual(nothing);
  });

  it.each([
    ['a scan', { stage: 'scan' }],
    ['a plan', { stage: 'plan' }],
    ['a run that failed', { endState: 'Failed' }],
    ['a run that was interrupted', { endState: 'Interrupted' }],
    ['a run that has not ended', { queueState: 'Running', endState: null }],
  ] as const)('RF-230 keeps the state of %s', async (_name, change) => {
    const { reader, asked } = readerOf({ 'coverage.json': coverage(area('A', 0.1)) });

    expect(await reader.execute({ actor: userAmy, run: ended(change) })).toEqual(nothing);
    expect(asked).toEqual([]);
  });
});
