import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { ReadRunFile } from '../../../../src/application/use-cases/read-run-file.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryRunFileReader } from '../../../support/memory-run-file-reader.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';
import { collectBytes } from '../../../support/zip-reader.js';

// RF-504, RF-506, RF-1105: Read run file gives the owner of a run one file of its folder, with the
// way to serve it; another user's run id and an unknown id answer like a file that does not exist.

const files = {
  'manifest.json': '{"schemaVersion":1}\n',
  'cards/BR/BR-001.md': '# Orders\n',
  'report/replay.html': '<!doctype html>\n',
  'handoff/page.html': '<p>x</p>\n',
};

const endedRun = (overrides: Partial<Run> = {}): Run =>
  sampleRun({
    userId: userAmy.userId,
    queueState: 'Ended',
    endState: 'Completed',
    startedAt: 1,
    endedAt: 2,
    ...overrides,
  });

async function setup(run: Run) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const reader = new MemoryRunFileReader();
  reader.seed(scopeOf(run), files);
  return new ReadRunFile({ runs, files: reader });
}

const request = (run: Run, path: string, actor: Actor = userAmy) => ({
  actor,
  runId: run.id,
  path,
});

describe('ReadRunFile', () => {
  it('RF-506 gives the owner the file with its size, name and how to serve it', async () => {
    const run = endedRun();
    const read = await setup(run);

    const result = await read.execute(request(run, 'cards/BR/BR-001.md'));

    if (!result.ok) throw new Error('The file was refused');
    expect(result.value).toMatchObject({
      fileName: 'BR-001.md',
      contentType: 'text/plain; charset=utf-8',
      disposition: 'inline',
      size: 9,
    });
    expect((await collectBytes(result.value.body)).toString('utf8')).toBe('# Orders\n');
  });

  it('RF-506 serves a page of the report as a page and a page anywhere else as a download', async () => {
    const run = endedRun();
    const read = await setup(run);

    const report = await read.execute(request(run, 'report/replay.html'));
    const other = await read.execute(request(run, 'handoff/page.html'));

    expect(report.ok && report.value.contentType).toBe('text/html; charset=utf-8');
    expect(other.ok && other.value.disposition).toBe('attachment');
    expect(other.ok && other.value.contentType).toBe('application/octet-stream');
  });

  it('RF-506 lets the owner read the files of a run that is still running', async () => {
    const run = runningRun({ userId: userAmy.userId });
    const read = await setup(run);

    expect((await read.execute(request(run, 'manifest.json'))).ok).toBe(true);
  });
});

describe('ReadRunFile and refusals', () => {
  it("RF-1105 answers not-found for another user's run, like an unknown one", async () => {
    const run = endedRun();
    const read = await setup(run);

    const other = await read.execute(request(run, 'manifest.json', userBob));
    const unknown = await read.execute({
      actor: userAmy,
      runId: 'not-a-run',
      path: 'manifest.json',
    });

    expect(other).toEqual({ ok: false, error: 'not-found' });
    expect(unknown).toEqual(other);
  });

  it.each(['coverage.md', '../manifest.json', '/manifest.json', 'cards'])(
    'RF-005 answers not-found for the path %j',
    async (path) => {
      const run = endedRun();
      const read = await setup(run);

      expect(await read.execute(request(run, path))).toEqual({ ok: false, error: 'not-found' });
    },
  );
});
