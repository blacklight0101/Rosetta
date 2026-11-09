import { expect, it } from 'vitest';
import { projectSchema, type ProjectSettings } from '../../../web/src/api/project-schemas.js';
import { settingsOnEveryRole } from '../../../web/src/pages/every-role-settings.js';
import { LOCAL_OLLAMA_MODEL } from '../../../web/src/pages/local-roles.js';
import type { ModelListState } from '../../../web/src/pages/model-lists.js';
import { projectOf } from './project-fixtures.js';

// RF-436, P8-75: the settings the start-page warning saves when "Apply to every role" is pressed:
// the four roles on the chosen provider, each with the model the every-role rule gives it, and
// every other setting as it was.

const anthropic: ModelListState = {
  status: 'ready',
  reason: undefined,
  models: [
    { model: 'claude-tiny', label: 'Claude Tiny', priced: true, noTools: true },
    { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', priced: true },
  ],
};

const settings = (): ProjectSettings => projectSchema.parse(projectOf('p-1', 'octo/demo')).settings;

const modelsOf = (saved: ProjectSettings) =>
  [saved.roles.reader, saved.roles.verifier, saved.roles.planner, saved.roles.summariser].map(
    (role) => [role.provider, role.model],
  );

it('RF-436 Apply from the start page gives each role the recommended model, the reader one that calls tools', () => {
  const saved = settingsOnEveryRole(settings(), { provider: 'anthropic', model: '' }, anthropic);

  expect(modelsOf(saved)).toEqual([
    ['anthropic', 'claude-haiku-5-5'],
    ['anthropic', 'claude-tiny'],
    ['anthropic', 'claude-tiny'],
    ['anthropic', 'claude-tiny'],
  ]);
  expect(Object.keys(saved.providers)).toContain('anthropic');
  expect(saved.roles.reader.maxTurns).toBe(settings().roles.reader.maxTurns);
  expect(saved.agents).toEqual(settings().agents);
});

it('RF-436 Apply from the start page with a model chosen gives that model to all four roles', () => {
  const saved = settingsOnEveryRole(
    settings(),
    { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    anthropic,
  );

  expect(modelsOf(saved)).toEqual(Array(4).fill(['anthropic', 'claude-sonnet-5-5']));
});

it('RF-436 Apply from the start page with Ollama and no model chosen switches like RF-132', () => {
  const base = settings();
  const reader = { ...base.roles.reader, model: 'qwen3:8b' };
  const planner = { ...base.roles.planner, provider: 'openai', model: 'gpt-5-nano' };
  const saved = settingsOnEveryRole(
    { ...base, roles: { ...base.roles, reader, planner } },
    { provider: 'ollama', model: '' },
    undefined,
  );

  expect(modelsOf(saved)).toEqual([
    ['ollama', 'qwen3:8b'],
    ['ollama', base.roles.verifier.model],
    ['ollama', LOCAL_OLLAMA_MODEL],
    ['ollama', base.roles.summariser.model],
  ]);
});
