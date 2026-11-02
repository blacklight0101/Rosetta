import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-429, DEC-193 (replaces the readers' 70% share of EV-27): the readers of an understand run have
// no fixed share of the run token cap. A run that writes few claims reads every area up to the run
// cap less the summariser's part. understand-cap.json: Catalog uses 200,330 tokens and writes one
// claim, Services about 2,400 more. At a run cap of 293,000 the old 70% share (205,100) stopped the
// readers before Services; now both areas are read and the run Completes.

const temp = useTempRoot('rosetta-understand-reader-reserve-');

const indexSchema = z.object({
  cards: z.array(z.object({ claimCounts: z.record(z.string(), z.number()) })),
});

const runCapped = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 293_000 } },
}));

async function fewClaims() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-cap.json',
    verifierRecording: 'verifier-all-supported.json',
    settings: runCapped,
  });
  await h.scan();
  const run = await h.understand({ areas: ['Catalog', 'Services'] });
  return { h, run };
}

describe('an understand run whose readers pass 70% of the run cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 DEC-193 a run with few claims reads every area, with no stop at 70%, and Completes', async () => {
    const { h, run } = await fewClaims();

    expect(run.endState).toBe('Completed');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'Done'],
      ['Services', 'Done'],
    ]);
    const events = await h.eventsOf(run);
    expect(events.filter((event) => event.type === 'budget.capReached')).toEqual([]);
    expect(events.some((event) => event.type === 'budget.readersStopped')).toBe(false);
  });

  it('RF-429 the claims the readers wrote are judged by the verifier, its claim is Supported', async () => {
    const { h, run } = await fewClaims();

    const file = join(h.runFolder(run), 'cards', 'index.json');
    const index = indexSchema.parse(await readJson(file));
    const counts = index.cards.map((card) => card.claimCounts);
    expect(counts).toEqual([expect.objectContaining({ Proposed: 0, Unverified: 0, Supported: 1 })]);
  });
});
