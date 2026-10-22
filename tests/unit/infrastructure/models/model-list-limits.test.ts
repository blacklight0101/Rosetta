import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  loadModelList,
  parseModelList,
} from '../../../../src/infrastructure/models/model-list-file.js';

// RF-405, Q-57: an entry of the shipped model list may carry the context window and the maximum
// output of the model, copied from the provider's model page (docs/providers.md section 3.6). A
// number that is not a positive whole number is refused, not guessed.

const shipped = fileURLToPath(new URL('../../../../prices/models.yaml', import.meta.url));

const entry = `
schemaVersion: 1
version: '2026-10-21'
models:
  - provider: anthropic
    model: claude-haiku-5-5
    label: Claude Haiku 5.5
`;

function refusal(text: string): unknown {
  try {
    parseModelList(text);
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
  return undefined;
}

describe('limits in the model list file', () => {
  it('Q-57 reads the context window and the maximum output of an entry', () => {
    const text = `${entry}    contextTokens: 1000000\n    maxOutputTokens: 128000\n`;

    expect(parseModelList(text).models).toEqual([
      {
        ...{ provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
        ...{ contextTokens: 1_000_000, maxOutputTokens: 128_000 },
      },
    ]);
  });

  it('Q-57 an entry without numbers stays valid and carries none', () => {
    const [only] = parseModelList(entry).models;

    expect(only).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      label: 'Claude Haiku 5.5',
    });
  });

  it.each([
    ['a zero window', '    contextTokens: 0\n'],
    ['a negative window', '    contextTokens: -5\n'],
    ['a fractional window', '    contextTokens: 1000.5\n'],
    ['a window written as text', "    contextTokens: '1M'\n"],
    ['a zero output', '    maxOutputTokens: 0\n'],
    ['a fractional output', '    maxOutputTokens: 12.5\n'],
  ])('Q-57 refuses %s with RST-1602', (_name, line) => {
    expect(refusal(`${entry}${line}`)).toBe(ERROR_CODES.priceTableInvalid);
  });
});

// The limits as the provider pages state them on 2026-10-21 (Anthropic models overview; OpenAI
// model pages under developers.openai.com/api/docs/models).
const pages = {
  'anthropic claude-opus-5-5': [1_000_000, 128_000],
  'anthropic claude-sonnet-5-5': [1_000_000, 128_000],
  'anthropic claude-haiku-5-5': [1_000_000, 128_000],
  'anthropic claude-fable-5-1': [1_000_000, 128_000],
  'openai gpt-6-astra': [1_050_000, 128_000],
  'openai gpt-6.1-sol': [1_050_000, 128_000],
  'openai gpt-6-sol': [1_050_000, 128_000],
  'openai gpt-6-luna': [1_050_000, 128_000],
  'openai gpt-5.6-sol': [1_050_000, 128_000],
  'openai gpt-5.6-terra': [1_050_000, 128_000],
  'openai gpt-5.6-luna': [1_050_000, 128_000],
  'openai gpt-5.5': [1_050_000, 128_000],
  'openai gpt-5.4': [1_050_000, 128_000],
  'openai gpt-5.4-mini': [400_000, 128_000],
  'openai gpt-5.4-nano': [400_000, 128_000],
  'openai gpt-5-mini': [400_000, 128_000],
  'openai gpt-5-nano': [400_000, 128_000],
  'openai gpt-5-nano-2025-08-07': [400_000, 128_000],
} as const;

describe('limits of the shipped model list', () => {
  it('Q-57 every listed model carries the numbers of its provider page, and no other model is listed', async () => {
    const list = await loadModelList(shipped);

    const listed = list.models.map((each) => [
      `${each.provider} ${each.model}`,
      [each.contextTokens, each.maxOutputTokens],
    ]);

    expect(Object.fromEntries(listed)).toEqual(pages);
  });
});
