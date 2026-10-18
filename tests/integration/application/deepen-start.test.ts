import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { completedRun, deepenOf, readerTasksAsked } from '../../support/deepen-run.js';
import { copyFixture } from '../../support/scan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-209, RF-1105, DEC-145 (Q-G, Q-L): a Deepen starts only from the owner's confirmation of a
// completed understand run of their own, never by itself, and leaves third-party code out.

const temp = useTempRoot('rosetta-deepen-start-');
const recordings = {
  recording: 'deepen-no-progress.json',
  verifierRecording: 'verifier-deepen-no-progress.json',
};

describe('RF-209 starting a Deepen', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 never starts a Deepen by itself at the end of a run', async () => {
    const { h, run } = await completedRun({ dataDir: temp.path, ...recordings });

    const runs = await h.runs.list(run.userId, run.projectId);

    expect(runs.map((each) => each.stage).sort()).toEqual(['scan', 'understand']);
    expect((await h.manifestOf(run)).deepen).toBeUndefined();
  });

  it('RF-209 starts nothing until the owner confirms', async () => {
    const { h, run } = await completedRun({ dataDir: temp.path, ...recordings });

    const refused = await h.deepen(run, { confirmed: false });

    expect(refused).toEqual({ ok: false, error: ERROR_CODES.deepenNotConfirmed });
    expect(await h.runs.list(run.userId, run.projectId)).toHaveLength(2);
  });

  it('RF-1105 answers another user deepening the run as if it did not exist', async () => {
    const { h, run } = await completedRun({ dataDir: temp.path, ...recordings });
    const stranger = { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' as const };

    const refused = await h.deepen(run, { actor: stranger });

    expect(refused).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(await h.runs.list(run.userId, run.projectId)).toHaveLength(2);
  });

  it('RF-209 refuses to deepen a run that is not a completed understand run', async () => {
    const h = await createUnderstandHarness({ dataDir: temp.path, ...recordings });
    const scan = await h.scan();

    expect(await h.deepen(scan)).toEqual({ ok: false, error: ERROR_CODES.runNotDeepenable });
  });
});

describe('RF-209 the Deepen run', UNDERSTAND_TIMEOUT, () => {
  it.each([0, 6])('RF-209 refuses a round limit of %i', async (maxRounds) => {
    const { h, run } = await completedRun({ dataDir: temp.path, ...recordings });

    expect(await h.deepen(run, { maxRounds })).toEqual({
      ok: false,
      error: ERROR_CODES.requestInvalid,
    });
  });

  it('RF-209 links the Deepen run to the completed run, which stays as it was', async () => {
    const { h, run } = await completedRun({ dataDir: temp.path, ...recordings });
    const before = await h.manifestOf(run);

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    expect(await deepenOf(h, deepen.value)).toMatchObject({
      parentRunId: run.id,
      parentRunKey: run.runKey,
      maxRounds: 3,
      coveragePass: false,
    });
    expect(await h.manifestOf(run)).toEqual(before);
  });
});

describe('RF-209 a rejected claim in third-party code', UNDERSTAND_TIMEOUT, () => {
  async function withLibrary(): Promise<string> {
    const repository = join(temp.path, 'repository');
    await copyFixture('webforms-csharp', repository);
    await mkdir(join(repository, 'Scripts'), { recursive: true });
    const library = '!function(e,t){"use strict";e.fn={}}(window);\n';
    await writeFile(join(repository, 'Scripts', 'jquery-3.4.1.min.js'), library, 'utf8');
    return repository;
  }

  it('RF-209 is never re-read and is listed out of scope with the reason', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      repository: await withLibrary(),
      recording: 'deepen-library.json',
      verifierRecording: 'verifier-deepen-library.json',
    });
    await h.scan();
    const run = await h.understand({ areas: ['Scripts'] });

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    const record = await deepenOf(h, deepen.value);
    expect(record.outOfScope).toEqual([
      {
        claimId: 'BR-001.c1',
        reason: 'It cites only third-party or generated code, which a Deepen does not read.',
      },
    ]);
    expect(record).toMatchObject({ stopReason: 'noProgress', roundsDone: 0, rounds: [] });
    expect(readerTasksAsked(h).filter((id) => id >= 'reader-002')).toEqual([]);
  });
});
