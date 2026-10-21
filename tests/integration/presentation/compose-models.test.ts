import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { loadPriceTable } from '../../../src/infrastructure/budget/price-file.js';
import { composeModels } from '../../../src/presentation/compose-models.js';

// RF-405, DEC-156: the composition root reads the shipped model list and the price table, and asks
// the Ollama server `ROSETTA_OLLAMA_URL` names and no other.

const prices = fileURLToPath(new URL('../../../prices/default-prices.yaml', import.meta.url));

it('RF-405 serves the shipped Anthropic and OpenAI lists, priced from the shipped price table', async () => {
  const { listModels } = await composeModels({
    environment: { ollamaUrl: undefined, test: true },
    priceTable: await loadPriceTable(prices),
  });

  const anthropic = await listModels.execute('anthropic');
  const openai = await listModels.execute('openai');

  expect(anthropic.models.map((entry) => entry.model)).toEqual([
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
    'claude-fable-5-1',
  ]);
  expect(anthropic.models.every((entry) => entry.priced)).toBe(true);
  expect(openai.models.length).toBeGreaterThan(0);
  expect(openai.models.every((entry) => entry.priced)).toBe(true);
});

it('RF-405 says no Ollama server is configured when ROSETTA_OLLAMA_URL is not set', async () => {
  const { listModels } = await composeModels({
    environment: { ollamaUrl: undefined, test: true },
    priceTable: await loadPriceTable(prices),
  });

  const answer = await listModels.execute('ollama');

  expect(answer).toEqual({
    provider: 'ollama',
    models: [],
    reason: 'No Ollama server is configured.',
  });
});
