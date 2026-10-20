import { describe, expect, it } from 'vitest';
import { ReadRunCoverage } from '../../../../src/application/use-cases/read-run-coverage.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MapRunTextFiles } from '../../../support/report-doubles.js';
import { replayDemoRunKey } from '../../../support/replay-fixture.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-230, RF-1005, RF-1105: the files of every area of a run, read or not, for the run page.

const run: Run = sampleRun({
  userId: userAmy.userId,
  runKey: replayDemoRunKey,
  stage: 'understand',
  queueState: 'Ended',
  endState: 'Completed',
  startedAt: 1,
  endedAt: 2,
});

const coverageJson = JSON.stringify({
  schemaVersion: 1,
  areas: [
    {
      area: 'Catalog',
      files: [
        { path: 'Catalog/Edit.cs', read: [{ startLine: 1, endLine: 40 }] },
        { path: 'Catalog/List.cs', read: [] },
      ],
      tokens: 100,
      readTokens: 50,
      readTokenShare: 0.5,
      note: 'a note',
    },
    {
      area: 'Models',
      files: [{ path: 'Models/Item.cs', read: [] }],
      tokens: 10,
      readTokens: 0,
      readTokenShare: 0,
      failure: 'invalid output (RST-1300)',
    },
  ],
});

async function reader(files: Readonly<Record<string, string>>): Promise<ReadRunCoverage> {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  return new ReadRunCoverage({ runs, files: new MapRunTextFiles(files) });
}

describe('ReadRunCoverage', () => {
  it('RF-230 lists every file of every area with the lines read, none for a file not read', async () => {
    const read = await reader({ 'coverage.json': coverageJson });

    const result = await read.execute({ actor: userAmy, runId: run.id });

    expect(result).toEqual({
      ok: true,
      value: {
        areas: [
          {
            area: 'Catalog',
            files: [
              { path: 'Catalog/Edit.cs', read: [{ startLine: 1, endLine: 40 }] },
              { path: 'Catalog/List.cs', read: [] },
            ],
            note: 'a note',
          },
          {
            area: 'Models',
            files: [{ path: 'Models/Item.cs', read: [] }],
            failure: 'invalid output (RST-1300)',
          },
        ],
      },
    });
  });
});

describe('ReadRunCoverage without a file', () => {
  it('RF-230 gives no areas for a run without a coverage file or with one that is not one', async () => {
    const none = await (await reader({})).execute({ actor: userAmy, runId: run.id });
    const torn = await (
      await reader({ 'coverage.json': '{"schemaVersion": 1' })
    ).execute({
      actor: userAmy,
      runId: run.id,
    });
    const other = await (
      await reader({ 'coverage.json': '{"schemaVersion": 2, "areas": []}' })
    ).execute({
      actor: userAmy,
      runId: run.id,
    });

    expect(none).toEqual({ ok: true, value: { areas: [] } });
    expect(torn).toEqual({ ok: true, value: { areas: [] } });
    expect(other).toEqual({ ok: true, value: { areas: [] } });
  });
});

describe('ReadRunCoverage and the owner', () => {
  it("RF-1105 answers another user's run and an unknown one the same", async () => {
    const read = await reader({ 'coverage.json': coverageJson });

    const other = await read.execute({ actor: userBob, runId: run.id });
    const unknown = await read.execute({ actor: userAmy, runId: 'no-such-run' });

    expect(other).toEqual({ ok: false, error: 'not-found' });
    expect(unknown).toEqual({ ok: false, error: 'not-found' });
  });
});
