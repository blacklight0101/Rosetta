import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { claimOf, completedRun, deepenOf, readerTasksAsked } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209, RF-006, RF-422, RF-1108: a Deepen ends at a cap (`CapReached`, and it can be resumed) and
// when the owner presses Stop, each with its stop reason in the record.

const temp = useTempRoot('rosetta-deepen-stops-');

function runCap(maxTokens: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxTokens } },
  });
}

describe('RF-209 a Deepen stopped by a cap', UNDERSTAND_TIMEOUT, () => {
  async function capped() {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-no-progress.json',
      verifierRecording: 'verifier-deepen-supported.json',
    });
    // The Deepen run takes the caps of the project when it is accepted: too few for one call.
    await h.changeSettings(runCap(500));
    const deepen = await h.deepen(run, { coveragePass: false });
    if (!deepen.ok) throw new Error(deepen.error);
    return { h, deep: deepen.value };
  }

  it('RF-209 ends CapReached with the stop reason capReached and the round not done', async () => {
    const { h, deep } = await capped();

    expect(deep.endState).toBe('CapReached');
    const record = await deepenOf(h, deep);
    expect(record).toMatchObject({ stopReason: 'capReached', roundsDone: 0 });
    expect(record.rounds.map((round) => [round.complete, round.reread])).toEqual([[false, []]]);
  });

  it('RF-006 resumes a Deepen stopped by a cap and re-reads the claim the cap kept from its reader', async () => {
    const { h, deep } = await capped();
    await h.changeSettings(runCap(5_000_000));

    const resumed = await h.resume(deep);

    if (!resumed.ok) throw new Error(resumed.error);
    expect(resumed.value.endState).toBe('Completed');
    // RF-429, P5-30: at 500 tokens the readers' share has no room for a call, so the first run
    // started no task (and made no call to be refused); the resumed round's task is reader-003.
    expect(readerTasksAsked(h).filter((id) => id >= 'reader-003')).toEqual([
      'reader-003',
      'reader-003',
    ]);
    expect(await claimOf(h, deep, 'BR-003.c1')).toMatchObject({
      status: 'Supported',
      replaces: 'BR-001.c1',
    });
    const record = await deepenOf(h, deep);
    expect(record.rounds.map((round) => round.complete)).toEqual([false, true]);
    expect(record.stopReason).not.toBe('capReached');
  });
});

describe('RF-209 a Deepen the owner stops', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 ends Interrupted with the stop reason stopped when the owner presses Stop', async () => {
    // The completed run makes five calls (four reader turns and the summariser's merge); the
    // Deepen's first reader call is the sixth.
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-no-progress.json',
      verifierRecording: 'verifier-deepen-supported.json',
      beforeCall: async (call, harness) => {
        if (call === 6) await harness.stopRunning();
      },
    });

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    expect(deepen.value.endState).toBe('Interrupted');
    expect(await deepenOf(h, deepen.value)).toMatchObject({ stopReason: 'stopped' });
  });
});
