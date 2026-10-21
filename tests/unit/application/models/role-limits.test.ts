import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { roleLimits } from '../../../../src/application/models/role-limits.js';
import { settingsFor, withContextTokens } from '../../../support/provider-factory-harness.js';
import { withoutOutputLimits } from '../../../support/output-limits.js';

// RF-405, RF-201, Q-57: a hosted role runs with the context window of its model from the shipped
// list (128,000 when the list gives none) and, unless the project sets it, an output limit of the
// smaller of the model's maximum and the role's hosted default. Ollama keeps today's numbers.

const list: ModelList = {
  version: '2026-10-21',
  models: [
    {
      ...{ provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
      ...{ contextTokens: 1_000_000, maxOutputTokens: 128_000 },
    },
    {
      ...{ provider: 'openai', model: 'gpt-5-mini', label: 'GPT-5 mini' },
      ...{ contextTokens: 400_000, maxOutputTokens: 128_000 },
    },
    { provider: 'anthropic', model: 'claude-bare', label: 'Without numbers' },
    {
      ...{ provider: 'anthropic', model: 'claude-small', label: 'Small output' },
      ...{ contextTokens: 200_000, maxOutputTokens: 3_000 },
    },
    {
      ...{ provider: 'openai', model: 'gpt-edge-16000', label: 'Exactly the reader default' },
      ...{ contextTokens: 100_000, maxOutputTokens: 16_000 },
    },
    {
      ...{ provider: 'openai', model: 'gpt-edge-16001', label: 'One over the reader default' },
      ...{ contextTokens: 100_000, maxOutputTokens: 16_001 },
    },
  ],
};

const haiku = { provider: 'anthropic', model: 'claude-haiku-5-5' };

describe('the limits of a hosted role', () => {
  it('RF-405 a reader on Claude Haiku 5.5 has 1,000,000 tokens of context and 16,000 of output', () => {
    const settings = withoutOutputLimits(settingsFor({ reader: haiku }));

    expect(roleLimits(settings, 'reader', list)).toEqual({
      contextTokens: 1_000_000,
      contextAutomatic: false,
      modelContextTokens: 1_000_000,
      maxOutputTokens: 16_000,
    });
  });

  it('RF-405 an OpenAI model has the window of its entry', () => {
    const reader = { provider: 'openai', model: 'gpt-5-mini' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list).contextTokens).toBe(400_000);
  });

  it('RF-405 a model of the list without numbers keeps 128,000 tokens and the role default', () => {
    const reader = { provider: 'anthropic', model: 'claude-bare' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 128_000,
      modelContextTokens: undefined,
      maxOutputTokens: 16_000,
    });
  });

  it('RF-405 a model that is not in the list keeps 128,000 tokens', () => {
    const reader = { provider: 'openai', model: 'gpt-unlisted' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list).contextTokens).toBe(128_000);
  });

  it('RF-405 an entry of another provider does not give its numbers to a model of the same id', () => {
    const reader = { provider: 'openai', model: 'claude-haiku-5-5' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list).contextTokens).toBe(128_000);
  });
});

describe('what a project sets for a hosted role', () => {
  it('RF-405 the context a project sets for the provider wins over the list', () => {
    const base = withoutOutputLimits(settingsFor({ reader: haiku }));
    const settings = withContextTokens(base, 'anthropic', 200_000);

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 200_000,
      contextAutomatic: false,
    });
  });

  it('RF-405 the output limit a project sets wins, whatever the model allows', () => {
    const base = settingsFor({ reader: haiku });
    const reader = { ...base.roles.reader, maxOutputTokens: 4_096 };
    const settings = { ...base, roles: { ...base.roles, reader } };

    expect(roleLimits(settings, 'reader', list).maxOutputTokens).toBe(4_096);
  });
});

describe('the hosted defaults per kind', () => {
  it.each([
    ['reader', 16_000],
    ['verifier', 4_000],
    ['summariser', 4_000],
    ['planner', 32_000],
  ] as const)('Q-57 the hosted default of the %s is %i tokens', (role, expected) => {
    const settings = withoutOutputLimits(settingsFor({ [role]: haiku }));

    expect(roleLimits(settings, role, list).maxOutputTokens).toBe(expected);
  });

  it.each([
    ['anthropic', 'claude-small', 3_000],
    ['openai', 'gpt-edge-16000', 16_000],
    ['openai', 'gpt-edge-16001', 16_000],
  ] as const)(
    'Q-57 the default of %s %s never exceeds the model maximum: %i',
    (provider, model, expected) => {
      const settings = withoutOutputLimits(settingsFor({ reader: { provider, model } }));

      expect(roleLimits(settings, 'reader', list).maxOutputTokens).toBe(expected);
    },
  );
});

describe('the limits of an Ollama role', () => {
  const ollama = { provider: 'ollama', model: 'gemma4:e4b' };

  it.each([
    ['reader', 4_096],
    ['verifier', 2_048],
    ['planner', 16_384],
    ['summariser', 2_048],
  ] as const)('P3-64 the %s keeps the default of %i output tokens', (role, expected) => {
    const settings = withoutOutputLimits(settingsFor({ [role]: ollama }));

    expect(roleLimits(settings, role, list).maxOutputTokens).toBe(expected);
  });

  it('P3-75 an automatic context is estimated at the 32,768 floor and marked automatic', () => {
    const settings = withoutOutputLimits(settingsFor({ reader: ollama }));

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 32_768,
      contextAutomatic: true,
    });
  });

  it('P3-64 a fixed context is the project number', () => {
    const base = withoutOutputLimits(settingsFor({ reader: ollama }));
    const settings = withContextTokens(base, 'ollama', 65_536);

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 65_536,
      contextAutomatic: false,
    });
  });

  it('P3-64 a model name that the list also holds does not give an Ollama role its window', () => {
    const reader = { provider: 'ollama', model: 'gpt-5-mini' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list).contextTokens).toBe(32_768);
  });
});

describe('the limits of a compatible service', () => {
  it('Q-57 an OpenAI-compatible role takes neither the window nor the hosted defaults of the list', () => {
    const reader = { provider: 'openai-compatible', model: 'gpt-5-mini' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 128_000,
      modelContextTokens: undefined,
      maxOutputTokens: 4_096,
    });
  });
});
