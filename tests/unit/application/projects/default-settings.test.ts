import { describe, expect, it } from 'vitest';
import { settingsForNewProject } from '../../../../src/application/projects/default-settings.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { templateSettings } from '../../../support/project-fixtures.js';

// RF-010, DEC-106, data-model.md section 3.1: new projects take the template and the server's
// default models per role.

describe('settingsForNewProject', () => {
  it('RF-010 without server defaults a new project gets the template with the providers its roles use', () => {
    const settings = settingsForNewProject(templateSettings, {});

    expect(Object.keys(settings.providers)).toEqual(['ollama']);
    expect(settings.roles).toEqual(templateSettings.roles);
    expect(parseProjectSettings(settings).ok).toBe(true);
  });

  it('DEC-106 the server defaults choose provider and model per role and bring their providers', () => {
    const settings = settingsForNewProject(templateSettings, {
      reader: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' },
      verifier: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' },
    });

    expect(settings.roles.reader).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini-2024-07-18',
      maxTurns: templateSettings.roles.reader.maxTurns,
    });
    expect(settings.roles.verifier).toMatchObject({ provider: 'openai' });
    expect(settings.roles.planner).toEqual(templateSettings.roles.planner);
    expect(Object.keys(settings.providers).sort()).toEqual(['ollama', 'openai']);
    expect(parseProjectSettings(settings).ok).toBe(true);
  });

  it('RF-010 the reader decides the parallelism: 1 for Ollama, the template value otherwise', () => {
    const local = settingsForNewProject(templateSettings, {});
    const hosted = settingsForNewProject(templateSettings, {
      reader: { provider: 'openai', model: 'm' },
    });

    expect(local.agents.parallelism).toBe(1);
    expect(hosted.agents.parallelism).toBe(templateSettings.agents.parallelism);
    expect(hosted.agents.parallelism).toBe(4);
  });
});
