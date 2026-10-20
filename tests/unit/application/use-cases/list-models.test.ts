import { expect, it } from 'vitest';
import { ListModels } from '../../../../src/application/use-cases/list-models.js';
import {
  FakeInstalledModels,
  testModelList,
  testModelPrices,
} from '../../../support/model-services.js';

// RF-405, RF-427, DEC-156: the models a role of a provider can be set to. Anthropic and OpenAI come
// from the shipped list, each marked by whether the price table prices it; Ollama comes from the
// server's installed models, and a server that cannot be asked gives an empty list and a reason.

function listing(installed = new FakeInstalledModels()): ListModels {
  return new ListModels({ list: testModelList, prices: testModelPrices, installed });
}

it('RF-405 lists the Anthropic models of the list, none of them priced', async () => {
  const answer = await listing().execute('anthropic');

  expect(answer).toEqual({
    provider: 'anthropic',
    models: [
      { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', priced: false },
      { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', priced: false },
    ],
  });
});

it('RF-405 lists the OpenAI models and marks the one the price table has no price for', async () => {
  const answer = await listing().execute('openai');

  expect(answer.models).toEqual([
    { model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true },
    { model: 'gpt-5-future', label: 'GPT-5 future', priced: false },
  ]);
});

it('RF-405 lists the installed Ollama models in name order, once each, as priced (they cost nothing)', async () => {
  const installed = new FakeInstalledModels({
    ok: true,
    models: ['llama3:8b', 'gemma4:e4b', 'llama3:8b'],
  });

  const answer = await listing(installed).execute('ollama');

  expect(answer).toEqual({
    provider: 'ollama',
    models: [
      { model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true },
      { model: 'llama3:8b', label: 'llama3:8b', priced: true },
    ],
  });
});

it('RF-405 gives an empty list and the reason when Ollama cannot be asked', async () => {
  const installed = new FakeInstalledModels({
    ok: false,
    reason: 'Ollama did not answer in time.',
  });

  const answer = await listing(installed).execute('ollama');

  expect(answer).toEqual({
    provider: 'ollama',
    models: [],
    reason: 'Ollama did not answer in time.',
  });
});

it.each(['openai-compatible', 'fake', 'nowhere'])(
  'RF-405 lists nothing for %s and does not ask Ollama',
  async (provider) => {
    const installed = new FakeInstalledModels({ ok: true, models: ['gemma4:e4b'] });

    const answer = await listing(installed).execute(provider);

    expect(answer).toEqual({ provider, models: [] });
    expect(installed.asked).toBe(0);
  },
);

it('RF-405 does not ask Ollama for the models of another provider', async () => {
  const installed = new FakeInstalledModels();

  await listing(installed).execute('openai');

  expect(installed.asked).toBe(0);
});
