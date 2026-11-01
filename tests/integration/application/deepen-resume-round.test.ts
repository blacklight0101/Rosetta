import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209, RF-006, DEC-197, EV-62: a Deepen that a cap cut short in a round resumes that round under
// the same number, and the round run again replaces the incomplete one in the record.

const temp = useTempRoot('rosetta-deepen-resume-round-');

function runCap(maxTokens: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxTokens } },
  });
}

describe('RF-209 the round of a resumed Deepen', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 announces the resumed round with its own number and keeps one record of it', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-no-progress.json',
      verifierRecording: 'verifier-deepen-supported.json',
    });
    await h.changeSettings(runCap(500));
    const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
    if (!deepen.ok) throw new Error(deepen.error);
    await h.changeSettings(runCap(5_000_000));

    const resumed = await h.resume(deepen.value);

    if (!resumed.ok) throw new Error(resumed.error);
    const started = (await h.eventsOf(resumed.value)).filter(
      (event) => event.type === 'deepen.round.started',
    );
    expect(started.map((event) => event.data)).toMatchObject([
      { round: 1, maxRounds: 1 },
      { round: 1, maxRounds: 1 },
    ]);
    const record = await deepenOf(h, deepen.value);
    expect(record.rounds.map((round) => [round.round, round.complete])).toEqual([[1, true]]);
    expect(record.roundsDone).toBe(1);
  });
});
