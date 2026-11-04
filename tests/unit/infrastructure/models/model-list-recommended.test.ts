import { expect, it } from 'vitest';
import { loadModelList } from '../../../../src/infrastructure/models/model-list-file.js';

// RF-436, Q-68, P8-72: the first usable model of a provider in the shipped list is the one that
// choosing the provider selects, so the list must lead with a low-cost model, never Opus.

const list = await loadModelList('prices/models.yaml');
const firstOf = (provider: string) => list.models.find((entry) => entry.provider === provider);

it('RF-436 the shipped list leads Anthropic with Claude Haiku 5.5, not Opus', () => {
  expect(firstOf('anthropic')?.model).toBe('claude-haiku-5-5');
  expect(firstOf('anthropic')?.model).not.toBe('claude-opus-5-5');
});

it('RF-436 the shipped list leads OpenAI with gpt-5-nano, a model that can call tools', () => {
  expect(firstOf('openai')).toMatchObject({ model: 'gpt-5-nano' });
  expect(firstOf('openai')?.noTools).toBeUndefined();
});
