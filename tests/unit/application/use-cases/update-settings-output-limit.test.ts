import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsWith } from '../../../support/project-fixtures.js';
import { amy, projectHarness } from '../../../support/project-harness.js';

// RF-002, RF-402, DEC-163, P3-100: a save is refused when a role's output limit is above the
// maximum its model lists, with the range error on that field; nothing is stored.

const models: ModelList = {
  version: '2026-10-22',
  models: [
    { provider: 'anthropic', model: 'claude-haiku-5-5', label: 'H', maxOutputTokens: 128_000 },
    { provider: 'anthropic', model: 'claude-small', label: 'S', maxOutputTokens: 3_000 },
  ],
};

const provider = {
  kind: 'anthropic',
  keySource: 'user',
  toolMode: 'native',
  timeoutSeconds: 120,
  maxRetries: 3,
};

const withLimit = (model: string, limit: number) =>
  settingsWith({
    'providers.anthropic': provider,
    'roles.reader.provider': 'anthropic',
    'roles.reader.model': model,
    'roles.reader.maxOutputTokens': limit,
  });

async function save(model: string, limit: number) {
  const test = projectHarness({}, models);
  const created = await test.createProject.execute({
    actor: amy,
    url: 'https://github.com/owner/repo',
  });
  if (!created.ok) throw new Error('The project was not created');
  return test.updateProjectSettings.execute({
    actor: amy,
    projectId: created.value.project.id,
    settings: withLimit(model, limit),
  });
}

describe('UpdateProjectSettings: the output limit follows the model', () => {
  it('RF-002 a limit up to the maximum of the chosen model is saved', async () => {
    expect((await save('claude-haiku-5-5', 128_000)).ok).toBe(true);
  });

  it('RF-002 a limit above the maximum of the chosen model is refused with RST-1006 on its field', async () => {
    const outcome = await save('claude-small', 3_001);

    expect(outcome).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.settingsInvalid,
        problems: [
          { field: 'roles.reader.maxOutputTokens', code: ERROR_CODES.settingValueInvalid },
        ],
      },
    });
  });
});
