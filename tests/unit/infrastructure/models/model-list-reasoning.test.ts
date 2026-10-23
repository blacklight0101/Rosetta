import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  loadModelList,
  parseModelList,
} from '../../../../src/infrastructure/models/model-list-file.js';

// RF-405, RF-402, Q-58, P3-86: an entry of the shipped model list may carry `reasoning: true`,
// the mark of a model that takes a reasoning effort on the provider's API. Sources (checked
// 2026-10-21): platform.claude.com/docs/en/build-with-claude/effort lists the Anthropic models
// that accept `output_config.effort`; developers.openai.com model pages list reasoning token
// support, and the GPT-6 pages say Chat Completions takes function calling only with effort
// `none` (Sol, Luna) or not at all (Astra, 6.1 Sol), so those four are not marked.

const shipped = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));

const marked = `
schemaVersion: 1
version: '2026-10-21'
models:
  - provider: openai
    model: gpt-5-nano
    label: GPT-5 nano
    reasoning: true
  - provider: openai
    model: gpt-4.1-mini
    label: GPT-4.1 mini
`;

describe('model list reasoning marker', () => {
  it('RF-405 reads the marker and leaves it off an unmarked model', () => {
    expect(parseModelList(marked).models).toEqual([
      { provider: 'openai', model: 'gpt-5-nano', label: 'GPT-5 nano', reasoning: true },
      { provider: 'openai', model: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    ]);
  });

  it('RF-405 refuses a marker that is not true', () => {
    expect(() => parseModelList(marked.replace('reasoning: true', 'reasoning: low'))).toThrow();
    expect(() => parseModelList(marked.replace('reasoning: true', 'reasoning: false'))).toThrow();
  });
});

describe('the shipped model list: reasoning models', () => {
  it('Q-58 marks the Anthropic models that accept an effort and the OpenAI reasoning models that take tools on Chat Completions', async () => {
    const list = await loadModelList(shipped);

    const reasoning = list.models.filter((entry) => entry.reasoning === true);

    expect(reasoning.map((entry) => `${entry.provider}/${entry.model}`)).toEqual([
      'anthropic/claude-opus-5-5',
      'anthropic/claude-sonnet-5-5',
      'anthropic/claude-haiku-5-5',
      'anthropic/claude-fable-5-1',
      'openai/gpt-6-sol',
      'openai/gpt-6-luna',
      'openai/gpt-5.6-sol',
      'openai/gpt-5.6-terra',
      'openai/gpt-5.6-luna',
      'openai/gpt-5.5',
      'openai/gpt-5.4',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-nano',
      'openai/gpt-5-mini',
      'openai/gpt-5-nano',
      'openai/gpt-5-nano-2025-08-07',
    ]);
  });

  it('P3-130 marks gpt-6-astra and gpt-6.1-sol as models that cannot call tools, and no other', async () => {
    const list = await loadModelList(shipped);

    const toolless = list.models.filter((entry) => entry.noTools === true);

    expect(toolless.map((entry) => `${entry.provider}/${entry.model}`)).toEqual([
      'openai/gpt-6-astra',
      'openai/gpt-6.1-sol',
    ]);
    expect(toolless.every((entry) => entry.reasoning === undefined)).toBe(true);
  });
});

describe('model list noTools marker', () => {
  const text = marked.replace('reasoning: true', 'noTools: true');

  it('P3-130 reads the marker', () => {
    expect(parseModelList(text).models[0]).toEqual({
      provider: 'openai',
      model: 'gpt-5-nano',
      label: 'GPT-5 nano',
      noTools: true,
    });
  });

  it('P3-130 refuses a marker that is not true', () => {
    expect(() => parseModelList(text.replace('noTools: true', 'noTools: false'))).toThrow();
  });
});
