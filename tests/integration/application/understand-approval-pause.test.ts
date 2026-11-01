import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-432, ADR-026, DEC-196, EV-62: with the fake provider, a run whose next call would pass the
// amount its owner approved pauses in `AwaitingApproval` with its work saved, instead of ending at
// a hard cap. Continue (+N) runs only the unfinished tasks and the run ends `Completed`; Stop here
// gives the same saved result as a run that reached its cap today.

const temp = useTempRoot('rosetta-understand-approval-');
const areas = ['Catalog', 'Services'];

// As in understand-resume.test.ts: the reader tasks and the claim fit; the verifier's first call
// (worst case 32,768 tokens) does not.
const verifierOutput = (settings: ProjectSettings): ProjectSettings => ({
  ...settings,
  roles: { ...settings.roles, verifier: { ...settings.roles.verifier, maxOutputTokens: 32_768 } },
});
const capped = understandSettings((settings) => ({
  ...verifierOutput(settings),
  budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 228_000 } },
}));
// The project's caps are far above the approved amount: the approved amount is the run's line.
const roomy = understandSettings((settings) => ({
  ...verifierOutput(settings),
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 5_000_000 } },
}));
// DEC-205: the worst-case journey total the owner approved.
const approvedAmount = { tokens: 228_000, costMicros: 500_000 };

const indexSchema = z.object({
  cards: z.array(z.object({ id: z.string(), claimCounts: z.record(z.string(), z.number()) })),
});

async function indexOf(h: UnderstandHarness, run: Run) {
  return indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
}

async function harnessWith(settings: ProjectSettings): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-resume.json',
    settings,
    verifierRecording: 'verifier-all-supported.json',
  });
  await h.scan();
  return h;
}

async function endedData(h: UnderstandHarness, run: Run) {
  const events = await h.eventsOf(run);
  const ended = events.at(-1);
  expect(ended?.type).toBe('run.ended');
  const data = ended?.data ?? {};
  return { endState: data['endState'], errorCode: data['errorCode'] };
}

describe('RF-432 a run that reaches its approved amount', UNDERSTAND_TIMEOUT, () => {
  it('RF-432 pauses with its work saved, then Continue runs it to Completed', async () => {
    const h = await harnessWith(roomy);

    const paused = await h.understand({ areas, approvedAmount });

    expect(paused).toMatchObject({ queueState: 'AwaitingApproval', endState: null });
    expect((await h.runs.listRunning()).map((run) => run.id)).not.toContain(paused.id);
    expect((await indexOf(h, paused)).cards.map((card) => card.id)).toEqual(['BR-001']);
    // Each Continue adds half the approved amount; the owner answers until the run is done.
    let latest: Run = paused;
    for (let answers = 0; answers < 8 && latest.queueState === 'AwaitingApproval'; answers += 1) {
      const continued = await h.continueRun(latest);
      expect(continued.ok).toBe(true);
      if (!continued.ok) return;
      latest = continued.value;
    }
    expect(latest).toMatchObject({ id: paused.id, endState: 'Completed' });
  });

  it('RF-432 Stop here gives the same saved result as a run that reached its cap', async () => {
    const today = await harnessWith(capped);
    const capRun = await today.understand({ areas });
    const h = await harnessWith(roomy);
    const paused = await h.understand({ areas, approvedAmount });

    const stopped = await h.stopPaused(paused);

    expect(capRun.endState).toBe('CapReached');
    expect(stopped).toMatchObject({ endState: 'CapReached', unreadAreas: capRun.unreadAreas });
    expect(await endedData(h, stopped)).toEqual(await endedData(today, capRun));
    expect(await indexOf(h, stopped)).toEqual(await indexOf(today, capRun));
  });
});
