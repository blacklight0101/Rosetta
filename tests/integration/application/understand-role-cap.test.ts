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

// RF-423, RF-422, ADR-007: the reader reaches the cap of its role in the middle of an understand
// run. Its next task is refused by the budget guard and ends StoppedByCap, the finished task keeps
// its cards, and the run, which did not finish what it was asked to read, ends CapReached.

const temp = useTempRoot('rosetta-understand-role-cap-');

const indexSchema = z.object({
  cards: z.array(
    z.object({ claimCounts: z.object({ Proposed: z.number(), Unverified: z.number() }) }),
  ),
});

const readerCapped = understandSettings((settings) => ({
  ...settings,
  budget: {
    ...settings.budget,
    run: { maxCostMicros: 50_000_000, maxTokens: 50_000_000 },
    roles: { reader: { maxTokens: 205_000 } },
  },
}));

describe('an understand run whose reader reaches its role cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-423 the reader stops by its role cap, keeps the finished task and the run ends CapReached', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      settings: readerCapped,
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('CapReached');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state, task.cards])).toEqual([
      ['Catalog', 'Done', 1],
      ['Services', 'StoppedByCap', 0],
    ]);
    const events = await h.eventsOf(run);
    expect(events.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.budgetCapReached });
    const capEvents = events.filter((event) => event.type === 'budget.capReached');
    expect(capEvents.map((event) => event.data)).toMatchObject([
      { scope: 'role-tokens', role: 'reader' },
    ]);
  });

  it('RF-304 the claims not yet judged are left Unverified when a role cap stops the run', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      settings: readerCapped,
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    const file = join(h.runFolder(run), 'cards', 'index.json');
    const index = indexSchema.parse(await readJson(file));
    expect(index.cards.map((card) => card.claimCounts)).toEqual([
      expect.objectContaining({ Proposed: 0, Unverified: 1 }),
    ]);
  });
});
