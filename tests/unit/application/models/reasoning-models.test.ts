import { describe, expect, it } from 'vitest';
import {
  noToolModelsOf,
  reasoningModelsOf,
} from '../../../../src/application/models/model-list.js';

// RF-402, RF-405, Q-58, P3-86: a model is a reasoning model when the shipped list marks it for the
// same provider kind; a model of another kind, a typed model and an unmarked one are not.

const list = {
  version: '2026-10-21',
  models: [
    { provider: 'openai', model: 'gpt-5-nano', label: 'GPT-5 nano', reasoning: true as const },
    { provider: 'openai', model: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Haiku', reasoning: true as const },
  ],
};

describe('reasoningModelsOf', () => {
  const isReasoning = reasoningModelsOf(list);

  it('RF-405 is true for a marked model of its kind', () => {
    expect(isReasoning('openai', 'gpt-5-nano')).toBe(true);
    expect(isReasoning('anthropic', 'claude-haiku-5-5')).toBe(true);
  });

  it('RF-405 is false for an unmarked model, an unlisted one and the wrong kind', () => {
    expect(isReasoning('openai', 'gpt-4.1-mini')).toBe(false);
    expect(isReasoning('openai', 'gpt-5-nano-custom')).toBe(false);
    expect(isReasoning('anthropic', 'gpt-5-nano')).toBe(false);
  });

  it('RF-401 is false for a local model, an OpenAI-compatible service and the fake', () => {
    expect(isReasoning('ollama', 'gpt-5-nano')).toBe(false);
    expect(isReasoning('openai-compatible', 'gpt-5-nano')).toBe(false);
    expect(isReasoning('fake', 'gpt-5-nano')).toBe(false);
  });
});

describe('noToolModelsOf', () => {
  const toolless = noToolModelsOf({
    version: '2026-10-23',
    models: [
      { provider: 'openai', model: 'gpt-6-astra', label: 'astra', noTools: true as const },
      { provider: 'openai', model: 'gpt-6-luna', label: 'luna', reasoning: true as const },
    ],
  });

  it('P3-130 is true for a marked model of its kind only', () => {
    expect(toolless('openai', 'gpt-6-astra')).toBe(true);
    expect(toolless('openai', 'gpt-6-luna')).toBe(false);
    expect(toolless('anthropic', 'gpt-6-astra')).toBe(false);
    expect(toolless('ollama', 'gpt-6-astra')).toBe(false);
  });
});
