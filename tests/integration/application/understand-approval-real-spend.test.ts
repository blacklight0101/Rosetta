import { describe, expect, it } from 'vitest';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-432, RF-435, DEC-206, P8-03, EV-84: a step approved at exactly 120% of its own spend. The
// recorded run (fake provider, default role limits) is replayed deterministically: a first pass
// without an approved amount measures what the step spends, then the same step is approved at 1.2
// times that. Whether it pauses depends on the reservation of its last calls against the 20% left:
// a small step (5,590 tokens) pauses at the line, Continue (+N) adds half of the approved amount and
// Stop here ends it `CapReached`; the larger two-area step has more headroom than its last calls
// reserve, so it completes and is never cut short.

const temp = useTempRoot('rosetta-understand-real-spend-');
// A small recorded step (5,590 tokens) and a large one (the resume recording, over 100,000 tokens).
const small = { recording: 'understand-csharp-full.json', areas: ['Catalog'] };
const large = { recording: 'understand-resume.json', areas: ['Catalog', 'Services'] };

// Only the project's run caps are lifted, so the first pass is not limited; role limits are the defaults.
const unconstrained = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 5_000_000 } },
}));

async function harness(recording: string): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording,
    settings: unconstrained,
    verifierRecording: 'verifier-all-supported.json',
  });
  await h.scan();
  return h;
}

const spentOf = (run: Run): number => run.totals.inputTokens + run.totals.outputTokens;

/** The step measured in a first pass, then approved at exactly 120% of its own spend. */
async function approvedAtTwentyPercentOver(step: typeof small) {
  const { areas, recording } = step;
  const measured = await (await harness(recording)).understand({ areas });
  const line = Math.ceil(spentOf(measured) * 1.2);
  const h = await harness(recording);
  const run = await h.understand({ areas, approvedAmount: { tokens: line, costMicros: 500_000 } });
  return { h, run, line, measured };
}

describe('RF-432 a small step approved at 120% of its own spend', UNDERSTAND_TIMEOUT, () => {
  it('RF-432 P8-03 pauses at the line, before it has spent more than it was approved', async () => {
    const { run, line, measured } = await approvedAtTwentyPercentOver(small);

    expect(measured.endState).toBe('Completed');
    expect(run).toMatchObject({ queueState: 'AwaitingApproval', endState: null });
    expect(spentOf(run)).toBeLessThanOrEqual(line);
  });

  it('RF-432 P8-03 Continue (+N) offers half of the approved amount and the run goes on', async () => {
    const { h, run, line } = await approvedAtTwentyPercentOver(small);
    const asked = (await h.eventsOf(run)).filter((event) => event.type === 'run.awaitingApproval');
    expect(asked.at(-1)?.data['continueAmount']).toMatchObject({ tokens: Math.ceil(line / 2) });

    const continued = await h.continueRun(run);

    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    expect(continued.value.id).toBe(run.id);
    expect(spentOf(continued.value)).toBeGreaterThanOrEqual(spentOf(run));
    expect(continued.value.endState === null || continued.value.endState === 'Completed').toBe(
      true,
    );
  });

  it('RF-432 P8-03 Stop here ends the run CapReached within the approved amount', async () => {
    const { h, run, line } = await approvedAtTwentyPercentOver(small);

    const stopped = await h.stopPaused(run);

    expect(stopped).toMatchObject({ id: run.id, endState: 'CapReached' });
    expect(spentOf(stopped)).toBeLessThanOrEqual(line);
  });
});

describe('RF-432 a larger step approved at 120% of its own spend', UNDERSTAND_TIMEOUT, () => {
  it('RF-432 P8-03 completes: a realistic approval never cuts the run short', async () => {
    const { run, measured } = await approvedAtTwentyPercentOver(large);

    expect(spentOf(measured)).toBeGreaterThan(100_000);
    expect(run).toMatchObject({ queueState: 'Ended', endState: 'Completed' });
  });
});
