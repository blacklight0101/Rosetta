import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { exportFileName, ExportZip } from '../../../../src/application/use-cases/export-zip.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { RUN_END_STATES } from '../../../../src/domain/runs/run-states.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryArchiveWriter } from '../../../support/memory-archive-writer.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';
import { userAmy, userBob } from '../../../support/run-harness.js';
import { collectBytes, filesOf, readZip } from '../../../support/zip-reader.js';

// RF-008, RF-1105: Export zip gives the owner of a finished run its zip as a stream, refuses a run
// that is in progress and answers another user's run id like an unknown one.

const files = { 'manifest.json': '{}\n', 'handoff/README.md': '# Hand-off\n' };

async function setup(run: Run, seeded: Readonly<Record<string, string>> = files) {
  const runs = new MemoryRunIndex();
  await runs.insert(run);
  const archives = new MemoryArchiveWriter();
  archives.seed(scopeOf(run), seeded);
  return new ExportZip({ runs, archives });
}

const endedRun = (overrides: Partial<Run> = {}) =>
  sampleRun({
    userId: userAmy.userId,
    queueState: 'Ended',
    endState: 'Completed',
    startedAt: 1,
    endedAt: 2,
    ...overrides,
  });

const request = (run: Run, part: 'run' | 'handoff' = 'run', actor: Actor = userAmy) => ({
  actor,
  runId: run.id,
  part,
});

describe('ExportZip', () => {
  it.each(RUN_END_STATES)('RF-008 zips a run that ended as %s', async (endState) => {
    const run = endedRun({ endState });
    const exportZip = await setup(run);

    const result = await exportZip.execute(request(run));

    if (!result.ok) throw new Error('The run was not exported');
    const entries = await readZip(await collectBytes(result.value.body));
    expect(Object.keys(filesOf(entries))).toEqual([
      `${run.runKey}/manifest.json`,
      `${run.runKey}/handoff/README.md`,
    ]);
    expect(result.value.fileName).toBe(`${run.runKey}.zip`);
  });
});

describe('ExportZip and the hand-off', () => {
  it('RF-008 zips only the hand-off package for the handoff part', async () => {
    const run = endedRun();
    const exportZip = await setup(run);

    const result = await exportZip.execute(request(run, 'handoff'));

    if (!result.ok) throw new Error('The hand-off was not exported');
    expect(filesOf(await readZip(await collectBytes(result.value.body)))).toEqual({
      'handoff/README.md': '# Hand-off\n',
    });
    expect(result.value.fileName).toBe(`${run.runKey}-handoff.zip`);
  });

  it.each([
    ['queued', sampleRun({ userId: userAmy.userId })],
    ['running', runningRun({ userId: userAmy.userId })],
  ])('RF-008 refuses a %s run as in progress', async (_name, run) => {
    const exportZip = await setup(run);

    expect(await exportZip.execute(request(run))).toEqual({ ok: false, error: 'in-progress' });
    expect(await exportZip.execute(request(run, 'handoff'))).toEqual({
      ok: false,
      error: 'in-progress',
    });
  });
});

describe('ExportZip and access', () => {
  it("RF-1105 answers not-found for another user's run", async () => {
    const run = endedRun();
    const exportZip = await setup(run);

    const result = await exportZip.execute(request(run, 'run', userBob));

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });

  it('RF-1105 answers not-found for another user even while the run is in progress', async () => {
    const run = runningRun({ userId: userAmy.userId });
    const exportZip = await setup(run);

    expect(await exportZip.execute(request(run, 'run', userBob))).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('RF-008 answers not-found for an unknown run id', async () => {
    const exportZip = await setup(endedRun());

    const result = await exportZip.execute({
      actor: userAmy,
      runId: '00000000-0000-4000-b000-00000000ffff',
      part: 'run',
    });

    expect(result).toEqual({ ok: false, error: 'not-found' });
  });

  it('RF-008 answers not-found for the hand-off of a run that has none', async () => {
    const run = endedRun();
    const exportZip = await setup(run, { 'manifest.json': '{}\n' });

    expect(await exportZip.execute(request(run, 'handoff'))).toEqual({
      ok: false,
      error: 'not-found',
    });
  });
});

describe('exportFileName', () => {
  it('RF-008 names the file after the run key', () => {
    expect(exportFileName('20261012-100000-understand', 'run')).toBe(
      '20261012-100000-understand.zip',
    );
    expect(exportFileName('20261012-100000-understand', 'handoff')).toBe(
      '20261012-100000-understand-handoff.zip',
    );
  });

  it('RF-008 keeps only letters, digits, dots, dashes and underscores', () => {
    const name = exportFileName('a"b\r\nc/..\\d;e fé', 'run');

    expect(name).toMatch(/^[A-Za-z0-9._-]+\.zip$/);
    expect(name).not.toContain('..');
  });
});
