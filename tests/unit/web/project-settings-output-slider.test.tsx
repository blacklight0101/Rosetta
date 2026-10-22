import { screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

const route = '/api/projects/p-1';

function sliderOf(label: string): HTMLInputElement {
  const field = screen.getByLabelText(label);
  const slider = field.closest('.rst-limit')?.querySelector('input[type="range"]');
  if (!(slider instanceof HTMLInputElement)) throw new Error(`${label} has no slider.`);
  return slider;
}

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

// RF-002, RF-402, DEC-163 (amends DEC-117), P3-100: the top of an output limit slider is the maximum
// output the chosen model lists, and 32,768 when the list gives none or the provider has no list.
function hostedReader(model: string) {
  const base = projectOf('p-1', 'octo/demo');
  const settings = templateSettings();
  return {
    ...base,
    settings: {
      ...settings,
      providers: {
        ...settings.providers,
        anthropic: {
          kind: 'anthropic',
          keySource: 'user-then-server',
          toolMode: 'native',
          timeoutSeconds: 120,
          maxRetries: 3,
        },
      },
      roles: {
        ...settings.roles,
        reader: { ...settings.roles.reader, provider: 'anthropic', model },
      },
    },
  };
}

const anthropicModels = json(200, {
  provider: 'anthropic',
  models: [
    { model: 'claude-haiku-5-5', label: 'Haiku', priced: true, maxOutputTokens: 128_000 },
    { model: 'claude-bare', label: 'Bare', priced: true },
  ],
});

it('RF-402 DEC-163 the output slider of a role tops out at the maximum of its chosen model', async () => {
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, hostedReader('claude-haiku-5-5')),
      'GET /api/models/anthropic': anthropicModels,
    },
    undefined,
    { projectId: 'p-1' },
  );

  await loaded();

  await waitFor(() => {
    expect(sliderOf('Reader max output tokens').max).toBe('128000');
  });
  expect(sliderOf('Planner max output tokens').max).toBe('32768');
});

it('RF-402 DEC-163 a listed model with no maximum keeps the 32,768 top', async () => {
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, hostedReader('claude-bare')),
      'GET /api/models/anthropic': anthropicModels,
    },
    undefined,
    { projectId: 'p-1' },
  );

  await loaded();
  await screen.findByRole('option', { name: 'Bare' });

  expect(sliderOf('Reader max output tokens').max).toBe('32768');
});
