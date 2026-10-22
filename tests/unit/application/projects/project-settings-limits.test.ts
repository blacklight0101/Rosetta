import { describe, expect, it } from 'vitest';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith, templateSettings } from '../../../support/project-fixtures.js';

// RF-002, RF-405, Q-57, data-model.md section 3.1: a role may leave its output limit out (it then
// takes the default of its model), a limit that is stored keeps its range, and a hosted provider
// may carry a fixed context number.

function problemsOf(input: unknown): readonly { field: string; code: string }[] {
  const result = parseProjectSettings(input);
  if (result.ok) throw new Error('The settings were accepted');
  return result.error.map(({ field, code }) => ({ field, code }));
}

const hosted = {
  kind: 'openai',
  keySource: 'user',
  toolMode: 'native',
  timeoutSeconds: 60,
  maxRetries: 2,
};
const allOnOpenAi = {
  'roles.reader.provider': 'openai',
  'roles.verifier.provider': 'openai',
  'roles.planner.provider': 'openai',
  'roles.summariser.provider': 'openai',
};

describe('the output limit of a role', () => {
  it('Q-57 the shipped template stores no output limit, so a new project takes the model defaults', () => {
    for (const role of Object.values(templateSettings.roles)) {
      expect(role.maxOutputTokens).toBeUndefined();
    }
  });

  it('Q-57 a role without an output limit is valid', () => {
    const result = parseProjectSettings(
      settingsWith({ 'roles.reader.maxOutputTokens': undefined }),
    );

    expect(result.ok).toBe(true);
  });

  it.each([
    [255, false],
    [256, true],
    [32_768, true],
    [32_769, false],
  ])('RF-002 a stored output limit of %i is accepted: %s', (value, accepted) => {
    const result = parseProjectSettings(settingsWith({ 'roles.reader.maxOutputTokens': value }));

    expect(result.ok).toBe(accepted);
  });
});

describe('the context number of a hosted provider', () => {
  it('Q-57 a number of at least 1 024 is accepted on a hosted provider', () => {
    const input = settingsWith({
      ...allOnOpenAi,
      providers: { openai: { ...hosted, contextTokens: 200_000 } },
    });

    expect(parseProjectSettings(input).ok).toBe(true);
  });

  it('Q-57 a number below 1 024 is refused on a hosted provider', () => {
    const input = settingsWith({
      ...allOnOpenAi,
      providers: { openai: { ...hosted, contextTokens: 1_023 } },
    });

    expect(problemsOf(input)).toEqual([
      { field: 'providers.openai.contextTokens', code: ERROR_CODES.settingValueInvalid },
    ]);
  });

  it('Q-57 the word auto stays Ollama only', () => {
    const input = settingsWith({
      ...allOnOpenAi,
      providers: { openai: { ...hosted, contextTokens: 'auto' } },
    });

    expect(problemsOf(input)).toEqual([
      { field: 'providers.openai.contextTokens', code: ERROR_CODES.settingValueInvalid },
    ]);
  });
});
