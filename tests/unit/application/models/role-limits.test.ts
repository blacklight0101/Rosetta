import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { roleLimits } from '../../../../src/application/models/role-limits.js';
import { settingsFor, withContextTokens } from '../../../support/provider-factory-harness.js';
import { withoutOutputLimits } from '../../../support/output-limits.js';

// RF-405, RF-201, Q-57: a hosted role keeps 128,000 tokens of context unless the project sets a
// number, which the model's window in the shipped list bounds, and, unless the project sets it, has
// an output limit of the smaller of the model's maximum and the role's hosted default. Ollama keeps
// today's numbers.

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
      ...{ provider: 'openai', model: 'gpt-edge-8192', label: 'Exactly the reader default' },
      ...{ contextTokens: 100_000, maxOutputTokens: 8_192 },
    },
    {
      ...{ provider: 'openai', model: 'gpt-edge-8193', label: 'One over the reader default' },
      ...{ contextTokens: 100_000, maxOutputTokens: 8_193 },
    },
  ],
};

const haiku = { provider: 'anthropic', model: 'claude-haiku-5-5' };

describe('the limits of a hosted role', () => {
  it('RF-405 a reader on Claude Haiku 5.5 keeps 128,000 tokens of context, knows its 1,000,000 window and writes 8,192', () => {
    const settings = withoutOutputLimits(settingsFor({ reader: haiku }));

    expect(roleLimits(settings, 'reader', list)).toEqual({
      contextTokens: 128_000,
      contextAutomatic: false,
      modelContextTokens: 1_000_000,
      modelMaxOutputTokens: 128_000,
      maxOutputTokens: 8_192,
    });
  });

  it('RF-405 an OpenAI model knows the window of its entry and keeps 128,000 tokens', () => {
    const reader = { provider: 'openai', model: 'gpt-5-mini' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 128_000,
      modelContextTokens: 400_000,
    });
  });

  it('RF-405 a model of the list without numbers keeps 128,000 tokens and the role default', () => {
    const reader = { provider: 'anthropic', model: 'claude-bare' };
    const settings = withoutOutputLimits(settingsFor({ reader }));

    expect(roleLimits(settings, 'reader', list)).toMatchObject({
      contextTokens: 128_000,
      modelContextTokens: undefined,
      maxOutputTokens: 8_192,
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

  it('RF-405 a context number a project sets never goes above the window of its model', () => {
    const reader = { provider: 'openai', model: 'gpt-5-mini' };
    const base = withoutOutputLimits(settingsFor({ reader }));

    const above = withContextTokens(base, 'openai', 900_000);
    const below = withContextTokens(base, 'openai', 300_000);

    expect(roleLimits(above, 'reader', list).contextTokens).toBe(400_000);
    expect(roleLimits(below, 'reader', list).contextTokens).toBe(300_000);
  });

  it('RF-405 a context number for a model without a window is used as it is', () => {
    const reader = { provider: 'anthropic', model: 'claude-bare' };
    const base = withoutOutputLimits(settingsFor({ reader }));

    const settings = withContextTokens(base, 'anthropic', 900_000);

    expect(roleLimits(settings, 'reader', list).contextTokens).toBe(900_000);
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
    ['reader', 8_192],
    ['verifier', 4_000],
    ['summariser', 4_000],
    ['planner', 16_384],
  ] as const)('Q-57 the hosted default of the %s is %i tokens', (role, expected) => {
    const settings = withoutOutputLimits(settingsFor({ [role]: haiku }));

    expect(roleLimits(settings, role, list).maxOutputTokens).toBe(expected);
  });

  it.each([
    ['anthropic', 'claude-small', 3_000],
    ['openai', 'gpt-edge-8192', 8_192],
    ['openai', 'gpt-edge-8193', 8_192],
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
