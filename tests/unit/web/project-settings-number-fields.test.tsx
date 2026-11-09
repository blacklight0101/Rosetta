import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436 (P8-76), design board P8ProjectSettings: the number fields show the value their slider
// shows (an unset output limit at the default the role runs with on its provider and model), and a
// number that can run to millions is also written with thousands separators beside its field.

const route = '/api/projects/p-1';

const anthropic = {
  kind: 'anthropic',
  keySource: 'user-then-server',
  toolMode: 'native',
  timeoutSeconds: 120,
  maxRetries: 3,
};

/** A project whose reader is on Anthropic and stores no output limit. */
function hostedReaderWithoutLimit(model: string): Record<string, unknown> {
  const settings = templateSettings();
  const { maxTurns } = settings.roles.reader;
  return projectOf('p-1', 'octo/demo', {
    settings: {
      ...settings,
      providers: { ...settings.providers, anthropic },
      roles: { ...settings.roles, reader: { provider: 'anthropic', model, maxTurns } },
    },
  });
}

const anthropicModels = json(200, {
  provider: 'anthropic',
  models: [
    { model: 'claude-haiku-5-5', label: 'Haiku', priced: true, maxOutputTokens: 128_000 },
    { model: 'claude-small', label: 'Small', priced: true, maxOutputTokens: 3_072 },
  ],
});

const renderSettings = (project: Record<string, unknown>) =>
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, project),
      [`PUT ${route}/settings`]: json(200, project),
      'GET /api/models/anthropic': anthropicModels,
    },
    undefined,
    { projectId: 'p-1' },
  );

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

function inputOf(label: string): HTMLInputElement {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLInputElement)) throw new Error(`${label} is not an input.`);
  return field;
}

it('RF-436 an unset hosted reader shows 8,192 in its field and slider, the limit it runs with', async () => {
  const { calls } = renderSettings(hostedReaderWithoutLimit('claude-haiku-5-5'));
  await loaded();
  await screen.findByRole('option', { name: /Haiku/u });

  expect(inputOf('Reader max output tokens').value).toBe('8192');
  expect(inputOf('Reader max output tokens slider').value).toBe('8192');
  expect(
    screen.getByText('8,192 is the default. The field and the slider always show the same value.'),
  ).toBeTruthy();
  expect(screen.queryByText(/^Differs from the default of 8,192/u)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await screen.findByText('Settings saved.');
  const body = calls.findLast((call) => call.method === 'PUT')?.body;
  expect(JSON.stringify(body)).not.toMatch(/"reader":\{[^}]*maxOutputTokens/u);
});

it('RF-436 the default of a hosted model with a smaller maximum is that maximum', async () => {
  renderSettings(hostedReaderWithoutLimit('claude-small'));
  await loaded();

  await waitFor(() => {
    expect(inputOf('Reader max output tokens').value).toBe('3072');
  });
  expect(inputOf('Reader max output tokens slider').value).toBe('3072');
  expect(screen.getByText(/^3,072 is the default\./u)).toBeTruthy();
});

it('RF-436 the large-number fields are written with thousands separators beside the field', async () => {
  renderSettings(projectOf('p-1', 'octo/demo'));
  await loaded();

  expect(inputOf('Run token cap').value).toBe('2000000');
  expect(screen.getByText('2,000,000 tokens')).toBeTruthy();
  expect(screen.getByText('1,000,000 bytes')).toBeTruthy();
  expect(screen.getByText('60,000 tokens')).toBeTruthy();

  fireEvent.input(inputOf('Run token cap'), { target: { value: '12500000' } });
  expect(screen.getByText('12,500,000 tokens')).toBeTruthy();
});
