import { screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { providerDefaults } from '../../../web/src/pages/provider-choices.js';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// P5-06: the default of the parallel readers follows the kind of the reader's provider entry, the
// way the server's default does (default-settings.ts), not the name of the entry.

const route = '/api/projects/p-1';

const renderSettings = (answers: Readonly<Record<string, Answer>>) =>
  renderPage(<ProjectSettingsPage />, answers, undefined, { projectId: 'p-1' });

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

function settingsWithReader(
  reader: { readonly provider: string; readonly model: string },
  providers: Record<string, unknown>,
  planner?: { readonly provider: string; readonly model: string },
): Record<string, unknown> {
  const base = templateSettings();
  return {
    ...base,
    providers: { ...base.providers, ...providers },
    roles: {
      ...base.roles,
      reader: { ...base.roles.reader, ...reader },
      ...(planner === undefined ? {} : { planner: { ...base.roles.planner, ...planner } }),
    },
  };
}

const projectWithSettings = (settings: Record<string, unknown>) => ({
  [`GET ${route}`]: json(200, projectOf('p-1', 'octo/demo', { settings })),
});

it('P5-06 a cloud reader reads Default 4 for the parallel readers', async () => {
  renderSettings(
    projectWithSettings(
      settingsWithReader(
        { provider: 'openai', model: 'gpt-5-nano' },
        { openai: providerDefaults['openai'] },
      ),
    ),
  );
  await loaded();

  expect(screen.getByText('Default 4. Allowed 1 to 8.')).not.toBeNull();
});

it('P5-06 an Ollama reader beside a cloud planner reads Default 1', async () => {
  renderSettings(
    projectWithSettings(
      settingsWithReader(
        { provider: 'ollama', model: 'gemma4:e4b' },
        { openai: providerDefaults['openai'] },
        { provider: 'openai', model: 'gpt-5-nano' },
      ),
    ),
  );
  await loaded();

  expect(screen.getByText('Default 1. Allowed 1 to 8.')).not.toBeNull();
});

it('P5-06 a cloud reader beside an Ollama planner reads Default 4', async () => {
  renderSettings(
    projectWithSettings(
      settingsWithReader(
        { provider: 'openai', model: 'gpt-5-nano' },
        { openai: providerDefaults['openai'] },
        { provider: 'ollama', model: 'gemma4:e4b' },
      ),
    ),
  );
  await loaded();

  expect(screen.getByText('Default 4. Allowed 1 to 8.')).not.toBeNull();
});

it('P5-06 an Ollama provider under a custom name reads Default 1', async () => {
  renderSettings(
    projectWithSettings(
      settingsWithReader(
        { provider: 'local', model: 'gemma4:e4b' },
        { local: providerDefaults['ollama'] },
      ),
    ),
  );
  await loaded();

  expect(screen.getByText('Default 1. Allowed 1 to 8.')).not.toBeNull();
});

it('P5-06 an entry named ollama of another kind reads Default 4', async () => {
  renderSettings(
    projectWithSettings(
      settingsWithReader(
        { provider: 'ollama', model: 'gpt-5-nano' },
        { ollama: { ...providerDefaults['openai'], kind: 'openai' } },
      ),
    ),
  );
  await loaded();

  expect(screen.getByText('Default 4. Allowed 1 to 8.')).not.toBeNull();
});
