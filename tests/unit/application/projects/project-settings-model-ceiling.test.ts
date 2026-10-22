import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith } from '../../../support/project-fixtures.js';

// RF-002, RF-402, DEC-163 (amends DEC-117), P3-100: the output limit a role may be set to goes from
// 256 up to the maximum output its model has in the shipped list, or 32,768 when the list gives
// none (or the provider has no list). A number above it is RST-1006 on that field.

const list: ModelList = {
  version: '2026-10-22',
  models: [
    {
      ...{ provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Haiku' },
      ...{ contextTokens: 1_000_000, maxOutputTokens: 128_000 },
    },
    { provider: 'openai', model: 'gpt-small', label: 'Small', maxOutputTokens: 3_000 },
    { provider: 'openai', model: 'gpt-bare', label: 'No numbers' },
  ],
};

const provider = (kind: 'anthropic' | 'openai') => ({
  kind,
  keySource: 'user',
  toolMode: 'native',
  timeoutSeconds: 120,
  maxRetries: 3,
});

function reader(kind: 'anthropic' | 'openai', model: string, limit: number) {
  return settingsWith({
    [`providers.${kind}`]: provider(kind),
    'roles.reader.provider': kind,
    'roles.reader.model': model,
    'roles.reader.maxOutputTokens': limit,
  });
}

const problems = (input: unknown) => {
  const result = parseProjectSettings(input, list);
  return result.ok ? [] : result.error;
};
const refused = [{ field: 'roles.reader.maxOutputTokens', code: ERROR_CODES.settingValueInvalid }];

describe('the output limit range follows the model (DEC-163)', () => {
  it('RF-002 a model with a listed maximum accepts up to it and refuses one above', () => {
    expect(problems(reader('anthropic', 'claude-haiku-5-5', 128_000))).toEqual([]);
    expect(problems(reader('anthropic', 'claude-haiku-5-5', 128_001))).toEqual(refused);
    expect(problems(reader('openai', 'gpt-small', 3_000))).toEqual([]);
    expect(problems(reader('openai', 'gpt-small', 3_001))).toEqual(refused);
  });

  it('RF-002 a listed model with no maximum, and an unlisted one, stop at 32,768', () => {
    expect(problems(reader('openai', 'gpt-bare', 32_768))).toEqual([]);
    expect(problems(reader('openai', 'gpt-bare', 32_769))).toEqual(refused);
    expect(problems(reader('openai', 'gpt-unlisted', 32_769))).toEqual(refused);
  });

  it('RF-002 the bottom of the range stays 256 for every model', () => {
    expect(problems(reader('anthropic', 'claude-haiku-5-5', 255))).toEqual(refused);
    expect(problems(reader('anthropic', 'claude-haiku-5-5', 256))).toEqual([]);
  });

  it('RF-002 without a list a number above 32,768 is refused', () => {
    const result = parseProjectSettings(reader('anthropic', 'claude-haiku-5-5', 40_000));

    expect(result.ok).toBe(false);
  });
});
