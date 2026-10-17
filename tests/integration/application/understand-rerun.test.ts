import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-203, RF-200, ADR-008: card ids are numbered per run, so a second understand run on the same
// snapshot, with the same recorded reader, gives the same cards the same ids and areas as the first.

const temp = useTempRoot('rosetta-understand-rerun-');

const indexSchema = z.object({
  cards: z.array(z.object({ id: z.string(), type: z.string(), area: z.string() })),
});

/** The card ids with their areas, and the areas of the reader tasks, of one run. */
async function idsOf(h: UnderstandHarness, run: Run) {
  const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
  const manifest = await h.manifestOf(run);
  return {
    cards: index.cards.map((card) => [card.id, card.area]),
    areas: manifest.agentTasks.map((task) => [task.agentTaskId, task.area]),
  };
}

describe('a second understand run on the same snapshot', UNDERSTAND_TIMEOUT, () => {
  it('RF-203 gives the same card ids and area names as the first run', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-csharp-full.json',
      replays: 2,
      // The summariser is capped out, so a run uses only the 11 recorded reader calls and the
      // second run starts where the recording does.
      settings: understandSettings((base) => ({
        ...base,
        budget: { ...base.budget, roles: { summariser: { maxTokens: 1 } } },
      })),
    });
    await h.scan();

    const first = await h.understand();
    const second = await h.understand();

    expect([first.endState, second.endState]).toEqual(['Completed', 'Completed']);
    expect(second.runKey).not.toBe(first.runKey);
    const firstIds = await idsOf(h, first);
    expect(firstIds).toEqual({
      cards: [
        ['BR-001', 'Catalog'],
        ['BR-002', 'Services'],
        ['ENT-001', 'Database'],
        ['FEAT-001', '(root)'],
        ['OQ-001', '(root)'],
      ],
      areas: [
        ['reader-001', '(root)'],
        ['reader-002', 'Catalog'],
        ['reader-003', 'Controllers'],
        ['reader-004', 'Database'],
        ['reader-005', 'Services'],
      ],
    });
    expect(await idsOf(h, second)).toEqual(firstIds);
  });
});
