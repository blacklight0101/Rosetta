import { expect, it } from 'vitest';
import { projectSchema, type ProjectSettings } from '../../../web/src/api/project-schemas.js';
import { settingsOnOllama } from '../../../web/src/pages/local-roles.js';
import { projectOf } from './project-fixtures.js';
import { uploadProject } from './start-run-private-fixtures.js';

// RF-132: the settings after "Switch every role to Ollama".

const settingsOf = (project: Record<string, unknown>): ProjectSettings =>
  projectSchema.parse(project).settings;

it('RF-132 puts all four roles on Ollama with the default local model and leaves the rest alone', () => {
  const before = settingsOf(uploadProject);

  const after = settingsOnOllama(before);

  const { reader, verifier, planner, summariser } = after.roles;
  const roles = [reader, verifier, planner, summariser];
  expect(roles.map((role) => role.provider)).toEqual(['ollama', 'ollama', 'ollama', 'ollama']);
  expect(roles.map((role) => role.model)).toEqual(Array(4).fill('gemma4:e4b'));
  expect(after.budget).toEqual(before.budget);
  expect(after.roles.reader.maxOutputTokens).toBe(before.roles.reader.maxOutputTokens);
});

it('RF-132 a role already on Ollama keeps its model', () => {
  const before = settingsOf(projectOf('p-1', 'x'));
  const custom = {
    ...before,
    roles: { ...before.roles, reader: { ...before.roles.reader, model: 'my-model' } },
  };

  expect(settingsOnOllama(custom).roles.reader.model).toBe('my-model');
});

it('RF-132 adds the Ollama provider when the project does not define it', () => {
  const before = settingsOf(uploadProject);
  const others = Object.fromEntries(
    Object.entries(before.providers).filter(([name]) => name !== 'ollama'),
  );

  const after = settingsOnOllama({ ...before, providers: others });

  expect(after.providers['ollama']?.kind).toBe('ollama');
});
