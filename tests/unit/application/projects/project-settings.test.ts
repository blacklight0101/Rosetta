import { describe, expect, it } from 'vitest';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith, templateSettings } from '../../../support/project-fixtures.js';

// RF-002 (second scenario), RF-405, RF-010, data-model.md section 3.1: the project settings schema.
// Each problem comes back with its field and an error code; nothing is cast.

function problemsOf(input: unknown): readonly { field: string; code: string }[] {
  const result = parseProjectSettings(input);
  if (result.ok) throw new Error('The settings were accepted');
  return result.error.map(({ field, code }) => ({ field, code }));
}

const openAi = {
  kind: 'openai',
  keySource: 'user',
  toolMode: 'native',
  timeoutSeconds: 60,
  maxRetries: 2,
};

describe('parseProjectSettings: valid documents', () => {
  it('RF-002 the shipped template is valid and parses to itself', () => {
    expect(parseProjectSettings(JSON.parse(JSON.stringify(templateSettings)))).toEqual({
      ok: true,
      value: templateSettings,
    });
  });

  it('RF-405 different providers and models for the four roles are accepted', () => {
    const input = settingsWith({
      providers: {
        ollama: templateSettings.providers['ollama'],
        openai: openAi,
        anthropic: { ...openAi, kind: 'anthropic' },
      },
      'roles.verifier.provider': 'openai',
      'roles.verifier.model': 'gpt-4o-mini-2024-07-18',
      'roles.planner.provider': 'anthropic',
      'roles.planner.model': 'claude-sonnet-4-5-20250929',
    });

    expect(parseProjectSettings(input).ok).toBe(true);
  });

  it('RF-002 the optional parts are accepted: prices, role caps, areas, temperature, deny lifts', () => {
    const input = settingsWith({
      'budget.prices': [
        {
          provider: 'openai',
          model: 'm-1',
          inputPerMillionMicros: 1,
          outputPerMillionMicros: 2,
          cachedInputPerMillionMicros: 0,
        },
      ],
      'budget.roles': { reader: { maxCostMicros: 0, maxTokens: 10 } },
      'budget.allowUnpriced': true,
      'scan.areas': [{ name: 'Catalog', include: ['src/Catalog/**'] }],
      'scan.allowDenied': ['*.key'],
      'roles.reader.temperature': 0.2,
      'agents.parallelism': 3,
      'output.transcripts': false,
    });

    expect(parseProjectSettings(input).ok).toBe(true);
  });
});

describe('parseProjectSettings: each problem names its field and code', () => {
  it('RF-002 an unknown provider kind is RST-1001 at the provider', () => {
    const input = settingsWith({ 'providers.ollama.kind': 'cohere' });

    expect(problemsOf(input)).toEqual([
      { field: 'providers.ollama.kind', code: ERROR_CODES.settingsProviderUnknown },
    ]);
  });

  it('RF-002 a role that names a provider the project does not define is RST-1001', () => {
    const input = settingsWith({ 'roles.verifier.provider': 'mystery' });

    expect(problemsOf(input)).toEqual([
      { field: 'roles.verifier.provider', code: ERROR_CODES.settingsProviderUnknown },
    ]);
  });

  it('RF-002 a role without a model is RST-1002', () => {
    const input = settingsWith({ 'roles.summariser.model': '  ' });

    expect(problemsOf(input)).toEqual([
      { field: 'roles.summariser.model', code: ERROR_CODES.settingsModelMissing },
    ]);
  });

  it('RF-405 a missing role is RST-1002 at the role, so every role needs a model', () => {
    const input = settingsWith({ 'roles.planner': undefined });

    expect(problemsOf(input)).toEqual([
      { field: 'roles.planner', code: ERROR_CODES.settingsModelMissing },
    ]);
  });
});

describe('parseProjectSettings: caps, prices and unknown keys', () => {
  it.each([
    ['budget.run.maxCostMicros', -1, 'budget.run.maxCostMicros'],
    ['budget.run.maxTokens', -5, 'budget.run.maxTokens'],
    ['budget.confirmAboveCostMicros', -1, 'budget.confirmAboveCostMicros'],
    ['budget.roles', { verifier: { maxTokens: -1 } }, 'budget.roles.verifier.maxTokens'],
  ])('RF-002 a negative cap set at %s is RST-1003', (path, value, field) => {
    expect(problemsOf(settingsWith({ [path]: value }))).toEqual([
      { field, code: ERROR_CODES.settingsCapNegative },
    ]);
  });

  it('RF-002 a negative price override is RST-1003', () => {
    const input = settingsWith({
      'budget.prices': [
        {
          provider: 'openai',
          model: 'm',
          inputPerMillionMicros: -1,
          outputPerMillionMicros: 1,
          cachedInputPerMillionMicros: 0,
        },
      ],
    });

    expect(problemsOf(input)).toEqual([
      { field: 'budget.prices.0.inputPerMillionMicros', code: ERROR_CODES.settingsCapNegative },
    ]);
  });

  it('RF-010 a baseUrl on a provider is refused with RST-1004 (DEC-112)', () => {
    const input = settingsWith({ 'providers.ollama.baseUrl': 'http://127.0.0.1:11434' });

    expect(problemsOf(input)).toEqual([
      { field: 'providers.ollama.baseUrl', code: ERROR_CODES.settingsBaseUrlRefused },
    ]);
  });

  it('RF-002 an unknown key is an error at that key, so a typo changes nothing', () => {
    expect(problemsOf(settingsWith({ 'scan.maxFileByte': 10 }))).toEqual([
      { field: 'scan.maxFileByte', code: ERROR_CODES.settingValueInvalid },
    ]);
  });
});

describe('parseProjectSettings: provider and role details', () => {
  it('RF-002 contextTokens is refused for a provider that is not Ollama', () => {
    const input = settingsWith({
      providers: { openai: { ...openAi, contextTokens: 'auto' } },
      'roles.reader.provider': 'openai',
      'roles.verifier.provider': 'openai',
      'roles.planner.provider': 'openai',
      'roles.summariser.provider': 'openai',
    });

    expect(problemsOf(input)).toEqual([
      { field: 'providers.openai.contextTokens', code: ERROR_CODES.settingValueInvalid },
    ]);
  });

  it('RF-002 contextTokens below 1 024 is refused', () => {
    expect(problemsOf(settingsWith({ 'providers.ollama.contextTokens': 512 }))).toEqual([
      { field: 'providers.ollama.contextTokens', code: ERROR_CODES.settingValueInvalid },
    ]);
  });

  it('RF-002 maxTurns belongs to the reader only', () => {
    expect(problemsOf(settingsWith({ 'roles.verifier.maxTurns': 5 }))).toEqual([
      { field: 'roles.verifier.maxTurns', code: ERROR_CODES.settingValueInvalid },
    ]);
  });

  it.each([
    ['agents.parallelism', 0],
    ['scan.maxFileBytes', 0],
    ['budget.allowUnpriced', 'yes'],
    ['scan.allowDenied', 'all'],
    ['schemaVersion', 2],
  ])('RF-002 %s with the value %j is RST-1006', (path, value) => {
    expect(problemsOf(settingsWith({ [path]: value }))).toEqual([
      { field: path, code: ERROR_CODES.settingValueInvalid },
    ]);
  });
});

describe('parseProjectSettings: several problems and wrong shapes', () => {
  it('RF-002 several problems are all returned, ordered by field', () => {
    const input = settingsWith({
      'budget.run.maxCostMicros': -1,
      'roles.reader.model': '',
      'providers.ollama.kind': 'x',
    });

    expect(problemsOf(input)).toEqual([
      { field: 'budget.run.maxCostMicros', code: ERROR_CODES.settingsCapNegative },
      { field: 'providers.ollama.kind', code: ERROR_CODES.settingsProviderUnknown },
      { field: 'roles.reader.model', code: ERROR_CODES.settingsModelMissing },
    ]);
  });

  it.each([[null], ['text'], [[]], [42]])('RF-002 %j is not a settings document', (input) => {
    expect(problemsOf(input)).toEqual([{ field: '', code: ERROR_CODES.settingValueInvalid }]);
  });
});

describe('parseProjectSettings: names that exist on every object', () => {
  const reserved = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];

  it.each(reserved)('RF-002 a role naming the provider %s is RST-1001, not accepted', (name) => {
    const input = settingsWith({ 'roles.reader.provider': name });

    expect(problemsOf(input)).toEqual([
      { field: 'roles.reader.provider', code: ERROR_CODES.settingsProviderUnknown },
    ]);
  });

  it.each(reserved)('RF-002 a provider named %s is refused at that name', (name) => {
    const provider = JSON.stringify(templateSettings.providers['ollama']);
    const text = JSON.stringify(settingsWith({})).replace(
      '"providers":{',
      `"providers":{${JSON.stringify(name)}:${provider},`,
    );

    const parsed: unknown = JSON.parse(text);
    const [first] = problemsOf(parsed);

    expect(first?.code).toBe(ERROR_CODES.settingValueInvalid);
    expect(first?.field.startsWith('providers')).toBe(true);
  });
});
