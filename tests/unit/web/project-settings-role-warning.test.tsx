import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, P8-74, the `P8ProjectSettings` artboard: when a role's provider cannot be used now (an
// unreachable Ollama, a provider with no key the user can use), a warning at the top of the page
// names it and its roles and holds the every-role control; no role is changed until Apply, and
// nothing is saved until Save settings.

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;
const demo = projectOf('p-1', 'octo/demo');

const anthropic = json(200, {
  provider: 'anthropic',
  models: [
    { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', priced: true },
    { model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', priced: true },
  ],
});
const openai = json(200, {
  provider: 'openai',
  models: [{ model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true }],
});
const installed = json(200, {
  provider: 'ollama',
  models: [{ model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true }],
});
const unreachable = json(200, {
  provider: 'ollama',
  models: [],
  reason: 'Ollama could not be reached.',
});

type Access = Readonly<Record<'anthropic' | 'openai' | 'openai-compatible', string>>;

/** `own`, `server` or `none` for each provider that takes a key. */
function keyAccess(access: Partial<Access>): Response {
  const providers = (['anthropic', 'openai', 'openai-compatible'] as const).map((provider) => ({
    provider,
    ownKey: access[provider] === 'own',
    serverKey: access[provider] === 'server',
  }));
  return json(200, { providers });
}

const renderSettings = (answers: Readonly<Record<string, Answer>> = {}) =>
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, demo),
      'GET /api/models/ollama': unreachable,
      'GET /api/models/anthropic': anthropic,
      'GET /api/models/openai': openai,
      'GET /api/account/key-access': keyAccess({ anthropic: 'own' }),
      [`PUT ${settingsRoute}`]: json(200, demo),
      ...answers,
    },
    undefined,
    { projectId: 'p-1' },
  );

/** A project whose planner uses OpenAI and whose other roles use Ollama. */
function plannerOnOpenAi(): Answer {
  const settings = templateSettings();
  const planner = { provider: 'openai', model: 'gpt-5-nano', maxOutputTokens: 16384 };
  return json(
    200,
    projectOf('p-1', 'octo/demo', {
      settings: { ...settings, roles: { ...settings.roles, planner } },
    }),
  );
}

function selectOf(label: string): HTMLSelectElement {
  const field = screen.getByLabelText(label, { exact: true });
  if (!(field instanceof HTMLSelectElement)) throw new Error(`${label} is not a select.`);
  return field;
}

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });
const warning = () => screen.findByRole('alert');

it('RF-436 an unreachable Ollama: the warning names it and the four roles, and offers the every-role control', async () => {
  renderSettings();
  await loaded();

  const alert = await warning();
  expect(alert.textContent).toContain(
    'Ollama cannot be reached. All four roles use it, so a run would fail at its first call.',
  );
  expect(alert.textContent).toContain('You have an Anthropic key.');
  await waitFor(() => {
    expect(
      Array.from(selectOf('Provider for every role').options).map((option) => [
        option.textContent,
        option.disabled,
      ]),
    ).toEqual([
      ['Anthropic', false],
      ['Ollama (not reachable)', true],
    ]);
  });
  expect(alert.contains(selectOf('Provider for every role'))).toBe(true);
  expect(screen.getAllByRole('button', { name: 'Apply to every role' })).toHaveLength(1);
  expect(selectOf('Reader provider').value).toBe('ollama');
});

it('RF-436 one Apply in the warning gives every role Anthropic with its recommended model', async () => {
  const { calls } = renderSettings();
  await loaded();
  await warning();
  await waitFor(() => {
    expect(selectOf('Provider for every role').value).toBe('anthropic');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Apply to every role' }));

  await waitFor(() => {
    for (const role of ['Reader', 'Verifier', 'Planner', 'Summariser']) {
      expect(selectOf(`${role} provider`).value).toBe('anthropic');
      expect(selectOf(`${role} model`).value).toBe('claude-haiku-5-5');
    }
  });
  expect(screen.queryByRole('alert')).toBeNull();
  await waitFor(() => {
    expect(document.activeElement).toBe(selectOf('Provider for every role'));
  });
  // Apply saves nothing, also a moment later: only Save settings saves (DEC-106).
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);

  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: {
      reader: { provider: 'anthropic', model: 'claude-haiku-5-5' },
      summariser: { provider: 'anthropic', model: 'claude-haiku-5-5' },
    },
  });
});

it('RF-436 a provider with no key: the warning names it and the one role that uses it', async () => {
  renderSettings({
    [`GET ${route}`]: plannerOnOpenAi(),
    'GET /api/models/ollama': installed,
    'GET /api/account/key-access': keyAccess({ anthropic: 'server' }),
  });
  await loaded();

  const alert = await warning();
  expect(alert.textContent).toContain(
    'OpenAI has no key you can use. The planner uses it, so a run would be refused (RST-2302).',
  );
  expect(alert.textContent).toContain('Ollama can be reached.');
  expect(alert.textContent).not.toContain('cannot be reached');
  expect(selectOf('Planner provider').value).toBe('openai');
});

it('RF-436 with no provider the user can use, the warning points to Settings and keys and holds no control', async () => {
  renderSettings({ 'GET /api/account/key-access': keyAccess({}) });
  await loaded();

  const alert = await warning();
  expect(alert.textContent).toContain(
    "Add your own key in Settings and keys, or ask the administrator to allow the server's key.",
  );
  expect(screen.getByRole('link', { name: 'Settings and keys' }).getAttribute('href')).toBe(
    '/settings',
  );
  expect(screen.queryByLabelText('Provider for every role')).toBeNull();
});

it('RF-436 with every role usable there is no warning, and the control stays in Roles', async () => {
  renderSettings({ 'GET /api/models/ollama': installed });
  await loaded();

  await waitFor(() => {
    expect(selectOf('Provider for every role').value).toBe('ollama');
  });
  expect(screen.queryByRole('alert')).toBeNull();
});
