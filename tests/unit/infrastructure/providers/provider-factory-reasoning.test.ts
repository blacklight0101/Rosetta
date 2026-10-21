import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { ProviderKind } from '../../../../src/application/ports/llm-provider.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { budgetTable } from '../../../support/budget-harness.js';
import {
  callFor,
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';

// RF-402, RF-404, RF-405, Q-58, P3-86: the provider factory gives the role's reasoning effort
// (low unless the project says otherwise) to the calls of a model the shipped list marks as a
// reasoning model, and never to any other model, whatever the role is set to.

const reasoning = (kind: ProviderKind, model: string): boolean =>
  (kind === 'openai' && model === 'contract-model') ||
  (kind === 'anthropic' && model === 'contract-claude');

const priceTable: PriceTable = {
  ...budgetTable,
  prices: [
    ...budgetTable.prices,
    ...budgetTable.prices.map((price) => ({
      ...price,
      provider: 'anthropic',
      model: 'contract-claude',
      cacheWriteInputPerMillionMicros: 1_250_000n,
    })),
  ],
};

const unwrapped = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) throw new Error(`The set was not built: ${JSON.stringify(result)}`);
  return result.value;
};

function readerOn(provider: string, model: string, effort?: 'low' | 'medium' | 'high') {
  const base = settingsFor({ reader: { provider, model } });
  const reader = {
    ...base.roles.reader,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
  const settings: ProjectSettings = { ...base, roles: { ...base.roles, reader } };
  return settings;
}

/** The request the reader's provider passed to its adapter. */
async function requestOf(
  settings: ProjectSettings,
  options: { readonly marked?: boolean; readonly callerEffort?: 'high' } = {},
) {
  const harness = factoryHarness({
    serverKeys: { openai: serverKeyText, anthropic: serverKeyText },
    ollamaUrl: 'http://localhost:11434',
    priceTable,
    ...(options.marked === false ? {} : { reasoningModels: reasoning }),
  });
  const set = unwrapped(
    await harness.factory.build(harness.request({ settings, cloudConsent: true })),
  );
  const chosen = set.get('reader');
  const extra = options.callerEffort === undefined ? {} : { reasoningEffort: options.callerEffort };
  await chosen?.provider.complete(callFor('reader', chosen.model, 1, extra));
  const [request] = harness.fakeList.flatMap((fake) => fake.requests);
  if (request === undefined) throw new Error('The adapter received no call.');
  return request;
}

describe('the reasoning effort of a role', () => {
  it('RF-402 is low by default for a model the list marks as a reasoning model', async () => {
    const request = await requestOf(readerOn('openai', 'contract-model'));

    expect(request.reasoningEffort).toBe('low');
  });

  it.each(['medium', 'high'] as const)(
    'RF-402 is the role setting %s when it is set',
    async (effort) => {
      const request = await requestOf(readerOn('openai', 'contract-model', effort));

      expect(request.reasoningEffort).toBe(effort);
    },
  );

  it('RF-402 a model the list does not mark never gets one, even when the role sets it', async () => {
    const unmarked = (kind: ProviderKind): boolean => kind === 'anthropic';
    const harness = factoryHarness({
      serverKeys: { openai: serverKeyText },
      reasoningModels: unmarked,
    });
    const settings = readerOn('openai', 'contract-model', 'high');
    const set = unwrapped(
      await harness.factory.build(harness.request({ settings, cloudConsent: true })),
    );

    await set.get('reader')?.provider.complete(callFor('reader', 'contract-model'));

    const [request] = harness.fakeList.flatMap((fake) => fake.requests);
    expect(request).toBeDefined();
    expect(request).not.toHaveProperty('reasoningEffort');
  });
});

describe('the reasoning effort of a role: models without one', () => {
  it('RF-402 nothing is sent when the factory was given no list of reasoning models', async () => {
    const request = await requestOf(readerOn('openai', 'contract-model', 'high'), {
      marked: false,
    });

    expect(request).not.toHaveProperty('reasoningEffort');
  });

  it('RF-401 a local model never gets one', async () => {
    const request = await requestOf(readerOn('ollama', 'gemma4:e4b', 'high'));

    expect(request).not.toHaveProperty('reasoningEffort');
  });

  it('RF-404 an Anthropic model the list marks gets the role effort', async () => {
    const request = await requestOf(readerOn('anthropic', 'contract-claude', 'medium'));

    expect(request.reasoningEffort).toBe('medium');
  });

  it('RF-402 an effort the caller already put on the request is kept', async () => {
    const request = await requestOf(readerOn('openai', 'contract-model'), { callerEffort: 'high' });

    expect(request.reasoningEffort).toBe('high');
  });
});
