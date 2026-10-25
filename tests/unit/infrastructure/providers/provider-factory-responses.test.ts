import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  noToolModelsOf,
  reasoningModelsOf,
  responsesModelsOf,
} from '../../../../src/application/models/model-list.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { loadModelList } from '../../../../src/infrastructure/models/model-list-file.js';
import { budgetTable } from '../../../support/budget-harness.js';
import {
  callFor,
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';

// P3-131, Q-58, P3-129, P3-130: a model the shipped list routes through the Responses API
// (gpt-6-astra, gpt-6.1-sol) is not refused for a tool role, and keeps the role's effort with
// tools (the P3-129 "none for tools" rule is for Chat Completions only). gpt-6-luna is unchanged.

const shipped = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));
const original = ['gpt-5-mini', 'gpt-5-nano', 'gpt-5-nano-2025-08-07'];
const names = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol', ...original];
const priceTable: PriceTable = {
  ...budgetTable,
  prices: [
    ...budgetTable.prices,
    ...names.flatMap((model) => budgetTable.prices.map((price) => ({ ...price, model }))),
  ],
};

function settingsOn(model: string, effort?: 'low' | 'high'): ProjectSettings {
  const base = settingsFor({
    reader: { provider: 'openai', model },
    summariser: { provider: 'openai', model },
  });
  const extra = effort === undefined ? {} : { reasoningEffort: effort };
  return {
    ...base,
    roles: {
      ...base.roles,
      reader: { ...base.roles.reader, ...extra },
      summariser: { ...base.roles.summariser, ...extra },
    },
  };
}

async function readerRequests(model: string, effort?: 'low' | 'high') {
  const list = await loadModelList(shipped);
  const harness = factoryHarness({
    serverKeys: { openai: serverKeyText },
    priceTable,
    reasoningModels: reasoningModelsOf(list),
    toolLessModels: noToolModelsOf(list),
    responsesModels: responsesModelsOf(list),
  });
  const built = await harness.factory.build(
    harness.request({
      settings: settingsOn(model, effort),
      cloudConsent: true,
      roles: ['reader'],
    }),
  );
  if (!built.ok) throw new Error(`Refused: ${JSON.stringify(built.error)}`);
  const chosen = built.value.get('reader');
  const base = callFor('reader', model, 1);
  await chosen?.provider.complete(base);
  await chosen?.provider.complete({ ...base, tools: [] });
  const [withTools, without] = harness.fakeList.flatMap((fake) => fake.requests);
  return { withTools, without, noted: harness.logger.entries.length };
}

describe('a model on the Responses route, given to the reader', () => {
  it.each(['gpt-6-astra', 'gpt-6.1-sol'])(
    'P3-131 %s is built for the reader and sends effort low with tools',
    async (model) => {
      const { withTools, without } = await readerRequests(model);

      expect(withTools?.tools.length).toBeGreaterThan(0);
      expect(withTools?.reasoningEffort).toBe('low');
      expect(without?.reasoningEffort).toBe('low');
    },
  );

  it('P3-131 keeps the effort the role sets with tools, and notes no lowered effort', async () => {
    const { withTools, noted } = await readerRequests('gpt-6-astra', 'high');

    expect(withTools?.reasoningEffort).toBe('high');
    expect(noted).toBe(0);
  });

  it.each(original)(
    'P3-132 / RF-402 %s tool calls go to Responses with the role effort, never none',
    async (model) => {
      const list = await loadModelList(shipped);
      const { withTools, without } = await readerRequests(model);
      const { withTools: high } = await readerRequests(model, 'high');

      expect(responsesModelsOf(list)('openai', model)).toBe(true);
      expect(withTools?.reasoningEffort).toBe('low');
      expect(without?.reasoningEffort).toBe('low');
      expect(high?.reasoningEffort).toBe('high');
    },
  );

  it.each(['gpt-6-luna', 'gpt-6-sol'])(
    'P3-129 %s, not on the route, still sends effort none with tools',
    async (model) => {
      const list = await loadModelList(shipped);
      const { withTools, without } = await readerRequests(model);

      expect(responsesModelsOf(list)('openai', model)).toBe(false);
      expect(withTools?.reasoningEffort).toBe('none');
      expect(without?.reasoningEffort).toBe('low');
    },
  );
});
