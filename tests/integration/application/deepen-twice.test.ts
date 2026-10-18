import { describe, expect, it } from 'vitest';
import { claimOf, completedRun, deepenOf, readerTasksAsked } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209 (scenario 6), DEC-145 (Q-L): a Deepen run that completed can be deepened in turn. A
// rejected claim an earlier Deepen already answered with a Supported replacement is not re-read.

const temp = useTempRoot('rosetta-deepen-twice-');

async function deepenedTwice() {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-coverage.json',
    verifierRecording: 'verifier-deepen-supported.json',
  });
  const first = await h.deepen(run, { maxRounds: 1 });
  if (!first.ok) throw new Error(first.error);
  const asked = readerTasksAsked(h).length;
  const second = await h.deepen(first.value, { maxRounds: 1 });
  if (!second.ok) throw new Error(second.error);
  return { h, first: first.value, second: second.value, asked };
}

describe('RF-209 a Deepen of a Deepen run', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 deepens a completed Deepen run and links the new run to it', async () => {
    const { h, first, second } = await deepenedTwice();

    expect(first.endState).toBe('Completed');
    expect(second.endState).toBe('Completed');
    expect(await deepenOf(h, second)).toMatchObject({
      parentRunId: first.id,
      parentRunKey: first.runKey,
    });
  });

  it('RF-209 does not re-read a rejected claim the earlier Deepen answered with a Supported replacement', async () => {
    const { h, second, asked } = await deepenedTwice();

    expect(await claimOf(h, second, 'BR-003.c1')).toMatchObject({
      status: 'Supported',
      replaces: 'BR-001.c1',
    });
    expect(await claimOf(h, second, 'BR-001.c1')).toMatchObject({ status: 'Rejected' });
    expect(readerTasksAsked(h)).toHaveLength(asked);
    expect(await deepenOf(h, second)).toMatchObject({ stopReason: 'noProgress', roundsDone: 0 });
  });
});
