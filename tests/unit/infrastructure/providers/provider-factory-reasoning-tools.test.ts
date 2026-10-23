import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { AgentRole, ProviderKind } from '../../../../src/application/ports/llm-provider.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { chatCompletionBody } from '../../../../src/infrastructure/providers/openai/openai-request.js';
import { budgetTable } from '../../../support/budget-harness.js';
import {
  callFor,
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';

// P3-129, RF-402, Q-58: OpenAI refuses a Chat Completions call that carries function tools and a
// reasoning effort other than `none` (HTTP 400, evaluation 2026-10-23, gpt-6-luna on every role).
// The factory's wrapper lowers the effort to `none` for a call with tools on an OpenAI reasoning
// model, keeps the role effort for a call without tools, and notes the change once per run.

const models = ['gpt-6-luna', 'gpt-6-sol', 'gpt-5.6-luna', 'gpt-5.5'];
const reasoning = (kind: ProviderKind, model: string): boolean =>
  models.includes(model) || (kind === 'anthropic' && model === 'contract-claude');

const priceTable: PriceTable = {
  ...budgetTable,
  prices: [
    ...budgetTable.prices,
    ...models.flatMap((model) => budgetTable.prices.map((price) => ({ ...price, model }))),
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

function settingsOn(
  provider: string,
  model: string,
  extra: { readonly effort?: 'low' | 'medium' | 'high' } = {},
): ProjectSettings {
  const base = settingsFor({ reader: { provider, model }, summariser: { provider, model } });
  const role = {
    ...(extra.effort === undefined ? {} : { reasoningEffort: extra.effort }),
  };
  return {
    ...base,
    roles: {
      ...base.roles,
      reader: { ...base.roles.reader, ...role },
      summariser: { ...base.roles.summariser, ...role },
    },
  };
}

async function harnessFor(settings: ProjectSettings) {
  const harness = factoryHarness({
    serverKeys: { openai: serverKeyText, anthropic: serverKeyText },
    priceTable,
    reasoningModels: reasoning,
  });
  const set = unwrapped(
    await harness.factory.build(
      harness.request({ settings, cloudConsent: true, roles: ['reader', 'summariser'] }),
    ),
  );
  const call = async (role: AgentRole, number: number, tools: boolean): Promise<void> => {
    const chosen = set.get(role);
    const base = callFor(role, chosen?.model ?? '', number);
    await chosen?.provider.complete({ ...base, tools: tools ? base.tools : [] });
  };
  const requests = () => harness.fakeList.flatMap((fake) => fake.requests);
  return { harness, call, requests };
}

describe('the reasoning effort of a call that carries tools', () => {
  it.each(models)(
    'RF-402 a reader call with tools to %s sends reasoning_effort none',
    async (model) => {
      const { call, requests } = await harnessFor(settingsOn('openai', model));

      await call('reader', 1, true);

      const [request] = requests();
      expect(request?.reasoningEffort).toBe('none');
      expect(request === undefined ? {} : chatCompletionBody(request)).toMatchObject({
        reasoning_effort: 'none',
      });
    },
  );

  it('Q-58 a summariser call without tools keeps the default effort low', async () => {
    const { call, requests } = await harnessFor(settingsOn('openai', 'gpt-6-luna'));

    await call('summariser', 1, false);

    const [request] = requests();
    expect(request?.reasoningEffort).toBe('low');
    expect(request === undefined ? {} : chatCompletionBody(request)).toMatchObject({
      reasoning_effort: 'low',
    });
  });

  it('Q-58 a call without tools keeps the effort the role sets', async () => {
    const { call, requests } = await harnessFor(
      settingsOn('openai', 'gpt-6-luna', { effort: 'high' }),
    );

    await call('summariser', 1, false);

    expect(requests()[0]?.reasoningEffort).toBe('high');
  });

  it('RF-402 a call with tools sends none even when the role sets another effort', async () => {
    const { call, requests } = await harnessFor(
      settingsOn('openai', 'gpt-6-luna', { effort: 'high' }),
    );

    await call('reader', 1, true);

    expect(requests()[0]?.reasoningEffort).toBe('none');
  });
});

describe('the reasoning effort of a call: other models', () => {
  it('RF-402 a model off the reasoning list gets no reasoning_effort, with or without tools', async () => {
    const { call, requests } = await harnessFor(settingsOn('openai', 'contract-model'));

    await call('reader', 1, true);
    await call('summariser', 2, false);

    const sent = requests();
    expect(sent).toHaveLength(2);
    for (const request of sent) {
      expect(request).not.toHaveProperty('reasoningEffort');
      expect(chatCompletionBody(request)).not.toHaveProperty('reasoning_effort');
    }
  });

  it('RF-404 an Anthropic call with tools keeps the role effort', async () => {
    const { call, requests } = await harnessFor(
      settingsOn('anthropic', 'contract-claude', { effort: 'medium' }),
    );

    await call('reader', 1, true);

    expect(requests()[0]?.reasoningEffort).toBe('medium');
  });

  it('RF-402 leaves temperature unsent when the role sets none', async () => {
    const { call, requests } = await harnessFor(settingsOn('openai', 'gpt-6-luna'));

    await call('reader', 1, true);

    const [request] = requests();
    expect(request === undefined ? {} : chatCompletionBody(request)).not.toHaveProperty(
      'temperature',
    );
  });
});

describe('the run log note about the lowered effort', () => {
  const lowered = (entries: readonly { readonly message: string }[]) =>
    entries.filter((entry) => entry.message.includes('reasoning effort'));

  it('P3-129 notes once per run that the effort was lowered for tool calls', async () => {
    const { harness, call } = await harnessFor(
      settingsOn('openai', 'gpt-6-luna', { effort: 'high' }),
    );

    await call('reader', 1, true);
    await call('reader', 2, true);
    await call('summariser', 3, true);

    const notes = lowered(harness.logger.entries);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.message).toContain('none');
  });

  it('P3-129 writes no note when no call carried tools', async () => {
    const { harness, call } = await harnessFor(settingsOn('openai', 'gpt-6-luna'));

    await call('summariser', 1, false);

    expect(lowered(harness.logger.entries)).toHaveLength(0);
  });
});
