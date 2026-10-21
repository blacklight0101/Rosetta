import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Run } from '../../../src/domain/runs/run.js';
import { completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import type { UnderstandHarness } from '../../support/understand-run-harness.js';

// RF-1108, RF-006, RF-250, Q-52: the owner's Stop during the Deepen's merge ends the Deepen
// Interrupted, like a Stop anywhere in a run, with every card kept; the Deepen is resumed from its
// own consolidation record, so the merge made before the Stop stands and is not asked for again.
// Call 8 asks about the rules and call 9 about the entities (four parent reader calls, the
// parent's merge, two reader calls of the round). Recorded answers only.

const temp = useTempRoot('rosetta-deepen-consolidation-stop-');

async function stoppedAt(call: number) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-merges-two-types.json',
    verifierRecording: 'verifier-deepen-supported.json',
    beforeCall: async (n, harness) => {
      if (n === call) await harness.stopRunning();
    },
  });
  const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, stopped: deepen.value };
}

const cardFiles = async (h: UnderstandHarness, run: Run, type: string) =>
  (await readdir(join(h.runFolder(run), 'cards', type))).sort();

const merges = (h: UnderstandHarness) =>
  h.providers
    .requests()
    .filter((request) => request.context.role === 'summariser')
    .map((request) => request.context.agentTaskId);

describe('RF-1108 a Stop during the merge of a Deepen', UNDERSTAND_TIMEOUT, () => {
  it('RF-1108 ends the Deepen Interrupted with the stop reason stopped and every card kept', async () => {
    const { h, stopped } = await stoppedAt(8);

    expect(stopped.endState).toBe('Interrupted');
    expect((await deepenOf(h, stopped)).stopReason).toBe('stopped');
    expect((await cardFiles(h, stopped, 'BR')).length).toBe(2);
    expect((await cardFiles(h, stopped, 'ENT')).length).toBe(2);
  });
});

describe('RF-006 a Deepen resumed between two merge calls', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 replays its own record: the rules merged before the Stop stand and are not asked again', async () => {
    const { h, stopped } = await stoppedAt(9);
    expect(stopped.endState).toBe('Interrupted');
    expect(await cardFiles(h, stopped, 'BR')).toEqual(['BR-001.md']);

    const resumed = await h.resume(stopped);

    if (!resumed.ok) throw new Error(resumed.error);
    expect(resumed.value.endState).toBe('Completed');
    expect(merges(h)).toEqual(['summariser-br', 'summariser-ent']);
    expect(await cardFiles(h, stopped, 'BR')).toEqual(['BR-001.md']);
    expect(await cardFiles(h, stopped, 'ENT')).toEqual(['ENT-001.md']);
  });
});
