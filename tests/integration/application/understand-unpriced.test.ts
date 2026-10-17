import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { serverKeyText, userKeyText } from '../../support/provider-factory-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-427, RF-422, ADR-007, DEC-112: an understand run whose reader is a cloud model missing from the
// price table. It stops before its first call, unless the model runs on the user's own key and the
// project allows unpriced models: then its cost is unknown and only the token cap applies.

const temp = useTempRoot('rosetta-understand-unpriced-');

const unpricedReader = (allowUnpriced: boolean, tokens: number) =>
  understandSettings((settings) => ({
    ...settings,
    roles: {
      ...settings.roles,
      reader: { ...settings.roles.reader, provider: 'openai', model: 'unlisted-model' },
    },
    // A run cost cap of zero: a model with a known price could not make one call.
    budget: {
      ...settings.budget,
      allowUnpriced,
      run: { maxCostMicros: 0, maxTokens: tokens },
    },
  }));

async function costReport(folder: string): Promise<unknown> {
  return JSON.parse(await readFile(join(folder, 'cost.json'), 'utf8'));
}

describe('an understand run with an unpriced cloud reader', UNDERSTAND_TIMEOUT, () => {
  it('RF-427 a server key never runs it: the run fails with RST-1601 before any call', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      settings: unpricedReader(true, 205_000),
      openAiKey: { of: 'server', key: serverKeyText },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog'], cloudConsent: true });

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.modelUnpriced,
    });
    expect(h.providers.requests()).toEqual([]);
    expect(h.providers.ledger.entries).toEqual([]);
  });

  it('RF-427 the user own key without allowUnpriced is refused the same way', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      settings: unpricedReader(false, 205_000),
      openAiKey: { of: 'user', key: userKeyText },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog'], cloudConsent: true });

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.modelUnpriced,
    });
    expect(h.providers.requests()).toEqual([]);
  });
});

describe(
  'an understand run with an unpriced model allowed on the user own key',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-427 RF-422 the user own key with allowUnpriced runs with an unknown cost and stops at the token cap', async () => {
      const h = await createUnderstandHarness({
        dataDir: temp.path,
        recording: 'understand-cap.json',
        settings: unpricedReader(true, 205_000),
        openAiKey: { of: 'user', key: userKeyText },
      });
      await h.scan();

      const run = await h.understand({ areas: ['Catalog', 'Services'], cloudConsent: true });

      expect(run.endState).toBe('CapReached');
      const manifest = await h.manifestOf(run);
      expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
        ['Catalog', 'Done'],
        ['Services', 'StoppedByCap'],
      ]);
      expect(
        h.providers.ledger.entries.map((entry) => [entry.costKnown, entry.costMicros]),
      ).toEqual([
        [false, 0n],
        [false, 0n],
      ]);
      expect(await costReport(h.runFolder(run))).toMatchObject({
        totals: { calls: 2, unpricedCalls: 2 },
      });
    });
  },
);
