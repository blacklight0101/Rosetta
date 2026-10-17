import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-422, RF-426, RNF-002, ADR-007: an understand run that a cap or the user stops keeps its
// finished cards, records its end state and writes the cost report of the calls it made.

const temp = useTempRoot('rosetta-understand-stop-');

const capped = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 205_000 } },
}));

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('an understand run stopped by its cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-422 a cap reached mid-run ends CapReached; the finished task keeps its cards, the next stops by cap', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      settings: capped,
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('CapReached');
    const manifest = await h.manifestOf(run);
    expect(manifest.endState).toBe('CapReached');
    expect(manifest.agentTasks).toEqual([
      {
        agentTaskId: 'reader-001',
        area: 'Catalog',
        role: 'reader',
        state: 'Done',
        turns: 2,
        cards: 1,
      },
      {
        agentTaskId: 'reader-002',
        area: 'Services',
        role: 'reader',
        state: 'StoppedByCap',
        turns: 0,
        cards: 0,
      },
    ]);
    const folder = h.runFolder(run);
    await expect(access(join(folder, 'cards', 'BR', 'BR-001.md'))).resolves.toBeUndefined();
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.budgetCapReached,
    });
  });
});

describe('the cost report of an understand run stopped by its cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-426 the cost report is written when the run ends at its cap', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      settings: capped,
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(await json(join(h.runFolder(run), 'cost.json'))).toMatchObject({
      totals: { calls: 2, inputTokens: 200_900, outputTokens: 330 },
    });
    await expect(access(join(h.runFolder(run), 'cost.md'))).resolves.toBeUndefined();
  });
});

describe('an understand run the user stops', UNDERSTAND_TIMEOUT, () => {
  it('RNF-002 an interrupted run keeps its finished cards, the manifest end state and the cost so far', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-stopped.json',
      beforeCall: async (call, harness) => {
        if (call === 3) await harness.stopRunning();
      },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('Interrupted');
    const manifest = await h.manifestOf(run);
    expect(manifest).toMatchObject({ endState: 'Interrupted', totals: { calls: 2 } });
    expect(manifest.endedAt).not.toBeNull();
    expect(manifest.agentTasks.map((task) => [task.area, task.state, task.cards])).toEqual([
      ['Catalog', 'Done', 1],
      ['Services', 'Failed', 0],
    ]);
    const folder = h.runFolder(run);
    expect(await readFile(join(folder, 'cards', 'BR', 'BR-001.md'), 'utf8')).toContain(
      'Details page shows a fixed name',
    );
    expect(await json(join(folder, 'cost.json'))).toMatchObject({ totals: { calls: 2 } });
  });
});
