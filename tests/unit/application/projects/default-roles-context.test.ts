import { describe, expect, it } from 'vitest';
import {
  OLLAMA_CONTEXT_MAX,
  OLLAMA_CONTEXT_MIN,
  parseDefaultRoles,
} from '../../../../src/application/projects/default-roles.js';
import { settingsForNewProject } from '../../../../src/application/projects/default-settings.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { CONTEXT_FLOOR } from '../../../../src/infrastructure/providers/ollama/ollama-context.js';
import { templateSettings } from '../../../support/project-fixtures.js';

// RF-401, DEC-106, Q-23, Q-44: the Default models page also sets the Ollama context size of new
// projects, `ollamaContextTokens` of the `defaultRoles` server setting.

describe('parseDefaultRoles: ollamaContextTokens', () => {
  it('Q-23 the floor of the field is the floor of the automatic choice', () => {
    expect(OLLAMA_CONTEXT_MIN).toBe(CONTEXT_FLOOR);
    expect(OLLAMA_CONTEXT_MAX).toBe(131_072);
  });

  it.each([['auto'], [OLLAMA_CONTEXT_MIN], [65_536], [OLLAMA_CONTEXT_MAX]])(
    'RF-401 %s is accepted',
    (value) => {
      expect(parseDefaultRoles({ ollamaContextTokens: value })).toEqual({
        ok: true,
        value: { ollamaContextTokens: value },
      });
    },
  );

  it.each([[OLLAMA_CONTEXT_MIN - 1], [OLLAMA_CONTEXT_MAX + 1], [8192.5], ['big'], [null]])(
    'Q-23 %s is refused with the field and RST-1006',
    (value) => {
      const result = parseDefaultRoles({ ollamaContextTokens: value });

      expect(result).toEqual({
        ok: false,
        error: [{ field: 'ollamaContextTokens', code: ERROR_CODES.settingValueInvalid }],
      });
    },
  );
});

describe('settingsForNewProject: ollamaContextTokens', () => {
  it('RF-401 a new project takes the size for its Ollama provider', () => {
    const settings = settingsForNewProject(templateSettings, { ollamaContextTokens: 65_536 });

    expect(settings.providers['ollama']).toMatchObject({ kind: 'ollama', contextTokens: 65_536 });
    expect(parseProjectSettings(settings).ok).toBe(true);
  });

  it('DEC-114 without the setting the template keeps auto', () => {
    const settings = settingsForNewProject(templateSettings, {});

    expect(settings.providers['ollama']).toMatchObject({ contextTokens: 'auto' });
  });

  it('RF-401 no Ollama role means no Ollama provider gets the size', () => {
    const hosted = { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' } as const;
    const settings = settingsForNewProject(templateSettings, {
      ollamaContextTokens: 65_536,
      reader: hosted,
      verifier: hosted,
      planner: hosted,
      summariser: hosted,
    });

    expect(Object.keys(settings.providers)).toEqual(['openai']);
    expect(parseProjectSettings(settings).ok).toBe(true);
  });
});
