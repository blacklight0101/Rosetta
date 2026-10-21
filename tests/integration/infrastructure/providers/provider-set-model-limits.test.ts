import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import type { ProviderSet } from '../../../../src/application/providers/provider-set.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { readerTaskSettings } from '../../../../src/application/understand/reader-settings.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { loadPriceTable } from '../../../../src/infrastructure/budget/price-file.js';
import { loadModelList } from '../../../../src/infrastructure/models/model-list-file.js';
import { withoutOutputLimits } from '../../../support/output-limits.js';
import {
  factoryHarness,
  serverKeyText,
  settingsFor,
  withContextTokens,
} from '../../../support/provider-factory-harness.js';

// RF-405, RF-201, Q-57: the provider factory gives each role the output limit and the context
// window of its model (the shipped list), unless the project sets them. Recorded fakes only.

const prices = fileURLToPath(new URL('../../../../prices/default-prices.yaml', import.meta.url));
const models = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));
const haiku = { provider: 'anthropic', model: 'claude-haiku-5-5' };

let priceTable: PriceTable;
let list: ModelList;

beforeAll(async () => {
  priceTable = await loadPriceTable(prices);
  list = await loadModelList(models);
});

async function setFor(settings: ProjectSettings): Promise<ProviderSet> {
  const harness = factoryHarness({
    serverKeys: { anthropic: serverKeyText, openai: serverKeyText },
    ollamaUrl: 'http://127.0.0.1:11434',
    priceTable,
    models: list,
  });
  const roles = ['reader', 'verifier', 'planner', 'summariser'] as const;
  const built = await harness.factory.build(harness.request({ settings, roles }));
  if (!built.ok) throw new Error('The set was not built.');
  return built.value;
}

describe('the limits of a role in the provider set', () => {
  it('RF-405 gives a hosted role the default of its kind, below the model maximum', async () => {
    const settings = withoutOutputLimits(
      settingsFor({ reader: haiku, verifier: haiku, planner: haiku, summariser: haiku }),
    );

    const set = await setFor(settings);

    expect([...set.entries()].map(([role, each]) => [role, each.maxOutputTokens])).toEqual([
      ['reader', 16_000],
      ['verifier', 4_000],
      ['planner', 32_000],
      ['summariser', 4_000],
    ]);
  });

  it('RF-201 the reader task of a Haiku 5.5 role runs with 1,000,000 tokens of context', async () => {
    const settings = withoutOutputLimits(settingsFor({ reader: haiku }));

    const reader = (await setFor(settings)).get('reader');
    if (reader === undefined) throw new Error('No reader');

    expect(readerTaskSettings(settings, reader)).toMatchObject({
      contextTokens: 1_000_000,
      contextShare: 0.8,
      maxOutputTokens: 16_000,
    });
  });
});

describe('what a project sets and the local roles in the provider set', () => {
  it('RF-405 the number a project sets for the output and for the context wins', async () => {
    const base = withContextTokens(settingsFor({ reader: haiku }), 'anthropic', 200_000);
    const reader = { ...base.roles.reader, maxOutputTokens: 4_096 };
    const settings = { ...base, roles: { ...base.roles, reader } };

    const role = (await setFor(settings)).get('reader');
    if (role === undefined) throw new Error('No reader');

    expect(role.maxOutputTokens).toBe(4_096);
    expect(readerTaskSettings(settings, role).contextTokens).toBe(200_000);
  });

  it('P3-64 an Ollama role keeps its own defaults and its context from the server', async () => {
    const ollama = { provider: 'ollama', model: 'gemma4:e4b' };
    const settings = withoutOutputLimits(settingsFor({ reader: ollama, verifier: ollama }));

    const set = await setFor(settings);
    const reader = set.get('reader');
    if (reader === undefined) throw new Error('No reader');

    expect(reader.maxOutputTokens).toBe(4_096);
    expect(set.get('verifier')?.maxOutputTokens).toBe(2_048);
    expect(readerTaskSettings(settings, reader).contextTokens).toBe(32_768);
  });
});
