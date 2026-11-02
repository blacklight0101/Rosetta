import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-432, RF-435, DEC-206, P8-03, EV-84: a run approved at 120% of the spend of the same recorded
// run (the fake provider) pauses at that line instead of running past it; Continue (+N) adds half
// of the approved amount, and Stop here ends the run `CapReached`.

const temp = useTempRoot('rosetta-understand-real-spend-');
const areas = ['Catalog', 'Services'];

// Output limits as the hosted models offer them: the last calls reserve their whole output.
const LARGE_OUTPUT = 64_000;

const roomy = understandSettings((settings) => ({
  ...settings,
  roles: {
    ...settings.roles,
    reader: { ...settings.roles.reader, maxOutputTokens: LARGE_OUTPUT },
    verifier: { ...settings.roles.verifier, maxOutputTokens: LARGE_OUTPUT },
    summariser: { ...settings.roles.summariser, maxOutputTokens: LARGE_OUTPUT },
  },
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 5_000_000 } },
}));

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

const spentOf = (run: Run): number => run.totals.inputTokens + run.totals.outputTokens;

/** The paused run, its line (120% of the recorded run's spend) and the harness it paused in. */
async function pausedAttenPercentOver() {
  const measured = await (await harnessWith(roomy)).understand({ areas });
  const line = Math.ceil(spentOf(measured) * 1.2);
  const h = await harnessWith(roomy);
  const paused = await h.understand({
    areas,
    approvedAmount: { tokens: line, costMicros: 500_000 },
  });
  return { h, paused, line, measured };
}

describe('RF-432 a run approved at 120% of the real spend', UNDERSTAND_TIMEOUT, () => {
  it('RF-432 P8-03 pauses at the line, before it has spent more than it was approved', async () => {
    const { paused, line, measured } = await pausedAttenPercentOver();

    expect(measured.endState).toBe('Completed');
    expect(paused).toMatchObject({ queueState: 'AwaitingApproval', endState: null });
    expect(spentOf(paused)).toBeLessThanOrEqual(line);
  });

  it('RF-432 P8-03 Continue (+N) offers half of the approved amount and the run goes on', async () => {
    const { h, paused, line } = await pausedAttenPercentOver();
    const asked = (await h.eventsOf(paused)).filter(
      (event) => event.type === 'run.awaitingApproval',
    );
    expect(asked.at(-1)?.data['continueAmount']).toMatchObject({ tokens: Math.ceil(line / 2) });

    const continued = await h.continueRun(paused);

    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    expect(continued.value.id).toBe(paused.id);
    expect(spentOf(continued.value)).toBeGreaterThanOrEqual(spentOf(paused));
    expect(continued.value.endState === null || continued.value.endState === 'Completed').toBe(
      true,
    );
  });

  it('RF-432 P8-03 Stop here ends the run CapReached within the approved amount', async () => {
    const { h, paused, line } = await pausedAttenPercentOver();

    const stopped = await h.stopPaused(paused);

    expect(stopped).toMatchObject({ id: paused.id, endState: 'CapReached' });
    expect(spentOf(stopped)).toBeLessThanOrEqual(line);
  });
});
