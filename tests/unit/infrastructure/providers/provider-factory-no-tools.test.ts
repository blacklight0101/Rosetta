import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  noToolModelsOf,
  reasoningModelsOf,
  type ModelList,
} from '../../../../src/application/models/model-list.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { loadModelList } from '../../../../src/infrastructure/models/model-list-file.js';
import { chatCompletionBody } from '../../../../src/infrastructure/providers/openai/openai-request.js';
import { budgetTable } from '../../../support/budget-harness.js';
import {
  callFor,
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';

// P3-130, RF-402, Q-58: a model the shipped list marks `noTools` cannot call tools on Chat
// Completions (gpt-6-astra, gpt-6.1-sol: HTTP 400 at every effort). A role that calls tools (the
// reader) on such a model is refused when the provider set is built, before any call and so before
// any cost; a role without tools (the summariser) may use it. The probes run on the shipped list.

const shipped = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));
const names = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol'];
const priceTable: PriceTable = {
  ...budgetTable,
  prices: [
    ...budgetTable.prices,
    ...names.flatMap((model) => budgetTable.prices.map((price) => ({ ...price, model }))),
  ],
};

function settingsOn(reader: string, summariser: string): ProjectSettings {
  return settingsFor({
    reader: { provider: 'openai', model: reader },
    summariser: { provider: 'openai', model: summariser },
  });
}

function harnessOn(list: ModelList) {
  return factoryHarness({
    serverKeys: { openai: serverKeyText },
    priceTable,
    reasoningModels: reasoningModelsOf(list),
    toolLessModels: noToolModelsOf(list),
  });
}

describe('a model that cannot call tools, given to a role that does', () => {
  it('P3-130 gpt-6-astra on the reader is refused at start naming the model and the role, with no call', async () => {
    const harness = harnessOn(await loadModelList(shipped));

    const built = await harness.factory.build(
      harness.request({
        settings: settingsOn('gpt-6-astra', 'gpt-6-luna'),
        cloudConsent: true,
        roles: ['reader', 'summariser'],
      }),
    );

    expect(built.ok).toBe(false);
    const problems = built.ok ? [] : built.error;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ role: 'reader', provider: 'openai', code: 'RST-1523' });
    expect(problems[0]?.message).toContain('gpt-6-astra');
    expect(problems[0]?.message).toContain('reader');
    expect(harness.fakeList.flatMap((fake) => fake.requests)).toEqual([]);
    expect(harness.metered).toEqual([]);
  });

  it('P3-130 gpt-6.1-sol on the reader is refused the same way', async () => {
    const harness = harnessOn(await loadModelList(shipped));

    const built = await harness.factory.build(
      harness.request({
        settings: settingsOn('gpt-6.1-sol', 'gpt-6.1-sol'),
        cloudConsent: true,
        roles: ['reader'],
      }),
    );

    expect(!built.ok && built.error.map((problem) => problem.code)).toEqual(['RST-1523']);
  });
});

describe('a model that cannot call tools, given to a role without tools', () => {
  it('P3-130 gpt-6-astra on the summariser (no tools) runs, with effort low', async () => {
    const harness = harnessOn(await loadModelList(shipped));
    const built = await harness.factory.build(
      harness.request({
        settings: settingsOn('gpt-6-luna', 'gpt-6-astra'),
        cloudConsent: true,
        roles: ['summariser'],
      }),
    );
    if (!built.ok) throw new Error(`Refused: ${JSON.stringify(built.error)}`);

    const chosen = built.value.get('summariser');
    const base = callFor('summariser', 'gpt-6-astra', 1);
    await chosen?.provider.complete({ ...base, tools: [] });

    const [request] = harness.fakeList.flatMap((fake) => fake.requests);
    expect(request?.reasoningEffort).toBe('low');
  });

  it('P3-130 a model list without the mark behaves as before: the reader on gpt-6-astra is built', async () => {
    const list = await loadModelList(shipped);
    const unmarked: ModelList = {
      ...list,
      models: list.models.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        label: entry.label,
      })),
    };
    const harness = harnessOn(unmarked);

    const built = await harness.factory.build(
      harness.request({
        settings: settingsOn('gpt-6-astra', 'gpt-6-astra'),
        cloudConsent: true,
        roles: ['reader'],
      }),
    );

    expect(built.ok).toBe(true);
  });
});

describe('the shipped list: gpt-6-luna on the reader', () => {
  it('P3-130 sends reasoning_effort none with tools and low without', async () => {
    const harness = harnessOn(await loadModelList(shipped));
    const built = await harness.factory.build(
      harness.request({
        settings: settingsOn('gpt-6-luna', 'gpt-6-luna'),
        cloudConsent: true,
        roles: ['reader'],
      }),
    );
    if (!built.ok) throw new Error(`Refused: ${JSON.stringify(built.error)}`);
    const chosen = built.value.get('reader');
    const base = callFor('reader', 'gpt-6-luna', 1);

    await chosen?.provider.complete(base);
    await chosen?.provider.complete({ ...base, tools: [] });

    const [withTools, without] = harness.fakeList.flatMap((fake) => fake.requests);
    expect(base.tools.length).toBeGreaterThan(0);
    expect(withTools === undefined ? {} : chatCompletionBody(withTools)).toMatchObject({
      reasoning_effort: 'none',
    });
    expect(without?.reasoningEffort).toBe('low');
  });
});
