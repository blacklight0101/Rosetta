import { describe, expect, it } from 'vitest';
import { modelFamilyOf, sameModelFamily } from '../../../../src/domain/verifier/model-family.js';

// RF-301, DEC-57: the family check behind the self-preference warning.

describe('model family', () => {
  it.each([
    ['gemma4:e4b', 'gemma'],
    ['gemma3:27b', 'gemma'],
    ['gpt-4o-mini', 'gpt'],
    ['gpt-5', 'gpt'],
    ['o3', 'gpt'],
    ['o4-mini', 'gpt'],
    ['claude-sonnet-4-5-20250929', 'claude'],
    ['claude-3-5-haiku-latest', 'claude'],
    ['llama3.1:8b', 'llama'],
    ['meta-llama/Llama-3.1-8B-Instruct', 'llama'],
    ['qwen2.5-coder:7b', 'qwen'],
    ['  Mistral-Small ', 'mistral'],
    ['4o', '4o'],
    ['chatgpt-4o-latest', 'gpt'],
    ['ft:gpt-4o-mini:org::x', 'gpt'],
    ['davinci-002', 'gpt'],
    ['anthropic.claude-3-5-sonnet-20240620-v1:0', 'claude'],
    ['us.anthropic.claude-3-5-haiku-20241022-v1:0', 'claude'],
    ['meta.llama3-1-8b-instruct-v1:0', 'llama'],
  ])('RF-301 the family of %s is %s', (model, family) => {
    expect(modelFamilyOf(model)).toBe(family);
  });

  it('RF-301 a reader and a verifier of one family share it, whatever the sizes and tags', () => {
    expect(sameModelFamily('gemma4:e4b', 'gemma3:27b')).toBe(true);
    expect(sameModelFamily('gpt-4o', 'o3-mini')).toBe(true);
    expect(sameModelFamily('claude-haiku-4-5', 'claude-opus-4-1')).toBe(true);
    expect(sameModelFamily('gpt-4o', 'chatgpt-4o-latest')).toBe(true);
    expect(sameModelFamily('gpt-4o', 'ft:gpt-4o-mini:org::x')).toBe(true);
    expect(sameModelFamily('claude-sonnet-4-5', 'anthropic.claude-3-5-sonnet-20240620-v1:0')).toBe(
      true,
    );
  });

  it('RF-301 models of different families are not the same family', () => {
    expect(sameModelFamily('gemma4:e4b', 'gpt-4o-mini')).toBe(false);
    expect(sameModelFamily('qwen2.5-coder:7b', 'claude-sonnet-4-5')).toBe(false);
    expect(sameModelFamily('fake-model', 'judge-model')).toBe(false);
  });
});
