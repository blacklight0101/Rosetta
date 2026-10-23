import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-429, RF-422, RF-304, EV-27: the readers of an understand run stop at their share of the run
// token cap (70%), without a role cap of their own. The claims they wrote are then judged with
// what is left, and the run ends CapReached, so its Supported claims can be planned.

const temp = useTempRoot('rosetta-understand-reader-reserve-');

const indexSchema = z.object({
  cards: z.array(z.object({ claimCounts: z.record(z.string(), z.number()) })),
});

// 70% of 293,000 is 205,100 tokens: the same stop as the reader cap of understand-role-cap.
const runCapped = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 293_000 } },
}));

async function capped() {
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

describe(
  'an understand run whose readers reach their share of the run cap',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-429 the readers stop by their share, not the run, and the run ends CapReached', async () => {
      const { h, run } = await capped();

      expect(run.endState).toBe('CapReached');
      const manifest = await h.manifestOf(run);
      expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
        ['Catalog', 'Done'],
        ['Services', 'Planned'],
      ]);
      const events = await h.eventsOf(run);
      expect(events.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.budgetCapReached });
      const capEvents = events.filter((event) => event.type === 'budget.capReached');
      expect(capEvents).toEqual([]);
      // P5-20: no task starts to be refused; the run says once that the readers stopped.
      const stops = events.filter((event) => event.type === 'budget.readersStopped');
      expect(stops.map((event) => event.data)).toMatchObject([{ reason: 'share' }]);
    });

    it('RF-429 the claims the readers wrote are judged by the verifier, its claim is Supported, not left Unverified', async () => {
      const { h, run } = await capped();

      const file = join(h.runFolder(run), 'cards', 'index.json');
      const index = indexSchema.parse(await readJson(file));
      const counts = index.cards.map((card) => card.claimCounts);
      expect(counts).toEqual([
        expect.objectContaining({ Proposed: 0, Unverified: 0, Supported: 1 }),
      ]);
    });
  },
);
