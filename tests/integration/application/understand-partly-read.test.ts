import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReadRunPartlyRead } from '../../../src/application/use-cases/read-run-partly-read.js';
import { ReadRunCoverage } from '../../../src/application/use-cases/read-run-coverage.js';
import { MemoryRunIndex } from '../../../src/infrastructure/db/memory-run-index.js';
import { readingOf } from '../../../web/src/lib/understanding/area-read.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { MapRunTextFiles } from '../../support/report-doubles.js';
import { replayDemoRunKey } from '../../support/replay-fixture.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { userAmy } from '../../support/run-harness.js';
import { useSharedFullRun } from '../../support/understand-full-run.js';

// RF-230, RF-231, ADR-008 (P8-93, UX-23): with the recorded responses of a small app (the C# fixture:
// the reader opens one file of three of its areas) the understand ends with those areas "partly
// read": the run writes the first-party share of each area, the coverage route hands it to the page,
// and the page lists the areas under the coverage bar, the other two being read.

const full = useSharedFullRun('rosetta-partly-read-');

describe('an understand run on the C# fixture: partly read areas', () => {
  it('RF-230 RF-231 says partly read for the areas below the coverage bar and read for the others', async () => {
    const { folder } = full.current();
    const run = sampleRun({
      userId: userAmy.userId,
      runKey: replayDemoRunKey,
      stage: 'understand',
      queueState: 'Ended',
      endState: 'Completed',
      startedAt: 1,
      endedAt: 2,
    });
    const runs = new MemoryRunIndex();
    await runs.insert(run);
    const files = new MapRunTextFiles({
      'coverage.json': await readFile(join(folder, 'coverage.json'), 'utf8'),
    });

    const answer = await new ReadRunCoverage({ runs, files }).execute({
      actor: userAmy,
      runId: run.id,
    });

    if (!answer.ok) throw new Error('The coverage route answered not-found');
    const reading = readingOf(answer.value, false, undefined);
    expect(reading.status).toBe('known');
    const partly = reading.status === 'known' ? [...reading.partly.keys()] : [];
    expect(partly).toEqual(['(root)', 'Catalog', 'Database']);
    expect(answer.value.areas.map((each) => each.area)).toEqual([
      '(root)',
      'Catalog',
      'Controllers',
      'Services',
      'Database',
    ]);
  });
});

describe('the run lists on the C# fixture: partly read areas', () => {
  it('RF-230 RF-1008 gives the run lists the same three partly read areas, from the same coverage', async () => {
    const { folder } = full.current();
    const run = sampleRun({
      userId: userAmy.userId,
      runKey: replayDemoRunKey,
      stage: 'understand',
      queueState: 'Ended',
      endState: 'Completed',
      startedAt: 1,
      endedAt: 2,
    });
    const files = new MapRunTextFiles({
      'coverage.json': await readFile(join(folder, 'coverage.json'), 'utf8'),
    });
    const reader = new ReadRunPartlyRead({
      ...{ files, logger: new RecordingLogger() },
      understanding: {
        forListing: () => ({
          libraryAreas: () => Promise.resolve(new Set<string>()),
          firstPartyShare: () => Promise.resolve(0.16),
        }),
      },
    });

    expect(await reader.forListing([run]).of(run)).toEqual({ areas: 3, share: 0.16 });
  });
});
