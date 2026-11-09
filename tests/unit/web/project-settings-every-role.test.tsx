import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, DEC-225, P8-73: "Provider for every role", "Model" and "Apply to every role" at the top
// of the Roles section. Only the providers the user can use now are listed; Apply fills
// the four roles in the form, and only Save settings saves them.

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
  models: [
    { model: 'gpt-no-tools', label: 'GPT no tools', priced: true, noTools: true },
    { model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true },
  ],
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
      'GET /api/models/ollama': installed,
      'GET /api/models/anthropic': anthropic,
      'GET /api/models/openai': openai,
      'GET /api/account/key-access': keyAccess({ anthropic: 'server', openai: 'own' }),
      [`PUT ${settingsRoute}`]: json(200, demo),
      ...answers,
    },
    undefined,
    { projectId: 'p-1' },
  );

function selectOf(label: string): HTMLSelectElement {
  const field = screen.getByLabelText(label, { exact: true });
  if (!(field instanceof HTMLSelectElement)) throw new Error(`${label} is not a select.`);
  return field;
}

const optionTexts = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map((option) => option.textContent);

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });
const everyRole = () => selectOf('Provider for every role');
const choose = (label: string, value: string): void => {
  fireEvent.change(selectOf(label), { target: { value } });
};
const apply = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Apply to every role' }));
};
const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
};

it('RF-436 the every-role control lists only the providers the user can use now', async () => {
  renderSettings({
    'GET /api/account/key-access': keyAccess({ anthropic: 'server', 'openai-compatible': 'own' }),
  });
  await loaded();

  await waitFor(() => {
    expect(optionTexts(everyRole())).toEqual(['Ollama', 'Anthropic', 'OpenAI-compatible']);
  });
});

it('RF-436 an unreachable Ollama and a provider with no key cannot be chosen', async () => {
  renderSettings({
    'GET /api/models/ollama': unreachable,
    'GET /api/account/key-access': keyAccess({ openai: 'own' }),
  });
  await loaded();

  // The roles use the unreachable Ollama, so the control sits in the warning of P8-74, which
  // also shows that Ollama, disabled (DEC-225).
  await waitFor(() => {
    const choosable = Array.from(everyRole().options).filter((option) => !option.disabled);
    expect(choosable.map((option) => option.textContent)).toEqual(['OpenAI']);
  });
});

it('RF-436 a server key counts only for a provider that may fall back to it', async () => {
  const settings = templateSettings();
  const userOnly = { kind: 'anthropic', keySource: 'user', toolMode: 'native', maxRetries: 3 };
  const project = projectOf('p-1', 'octo/demo', {
    settings: {
      ...settings,
      providers: { ...settings.providers, anthropic: { ...userOnly, timeoutSeconds: 120 } },
    },
  });
  renderSettings({
    [`GET ${route}`]: json(200, project),
    'GET /api/account/key-access': keyAccess({ anthropic: 'server', openai: 'server' }),
  });
  await loaded();

  await waitFor(() => {
    expect(optionTexts(everyRole())).toEqual(['Ollama', 'OpenAI']);
  });
});

it('RF-436 with no provider the user can use, the every-role row is not shown', async () => {
  renderSettings({
    'GET /api/models/ollama': unreachable,
    'GET /api/account/key-access': keyAccess({}),
  });
  await loaded();
  await screen.findByLabelText('Reader model');

  expect(screen.queryByLabelText('Provider for every role')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Apply to every role' })).toBeNull();
});

it("RF-436 the Model choice reads 'The recommended one per role' first, then the provider's models", async () => {
  renderSettings();
  await loaded();
  await waitFor(() => everyRole());

  choose('Provider for every role', 'anthropic');

  await waitFor(() => {
    expect(optionTexts(selectOf('Model'))).toEqual([
      'The recommended one per role',
      'Claude Haiku 5.5',
      'Claude Sonnet 5.5',
    ]);
  });
});

it('RF-436 Apply to every role gives the four roles the provider and each its recommended model', async () => {
  const { calls } = renderSettings();
  await loaded();
  await waitFor(() => everyRole());

  choose('Provider for every role', 'openai');
  await waitFor(() => {
    expect(optionTexts(selectOf('Model'))).toContain('GPT-5 nano');
  });
  apply();

  await waitFor(() => {
    expect(selectOf('Reader provider').value).toBe('openai');
    expect(selectOf('Reader model').value).toBe('gpt-5-nano');
    expect(selectOf('Summariser model').value).toBe('gpt-no-tools');
  });
  save();
  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: {
      reader: { provider: 'openai', model: 'gpt-5-nano' },
      verifier: { provider: 'openai', model: 'gpt-no-tools' },
      planner: { provider: 'openai', model: 'gpt-no-tools' },
      summariser: { provider: 'openai', model: 'gpt-no-tools' },
    },
  });
});

it('RF-436 Apply to every role with a chosen model sets that model on all four roles', async () => {
  renderSettings();
  await loaded();
  await waitFor(() => everyRole());

  choose('Provider for every role', 'anthropic');
  await waitFor(() => {
    expect(optionTexts(selectOf('Model'))).toContain('Claude Sonnet 5.5');
  });
  choose('Model', 'claude-sonnet-5-5');
  apply();

  await waitFor(() => {
    for (const role of ['Reader', 'Verifier', 'Planner', 'Summariser']) {
      expect(selectOf(`${role} provider`).value).toBe('anthropic');
      expect(selectOf(`${role} model`).value).toBe('claude-sonnet-5-5');
    }
  });
});

it('RF-436 Apply to every role saves nothing and hides "Settings saved." like any edit', async () => {
  const { calls } = renderSettings();
  await loaded();
  await waitFor(() => everyRole());
  save();
  await screen.findByText('Settings saved.');

  choose('Provider for every role', 'anthropic');
  apply();

  await waitFor(() => {
    expect(selectOf('Planner provider').value).toBe('anthropic');
  });
  expect(screen.queryByText('Settings saved.')).toBeNull();
  expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
});

it('RF-436 the every-role control works from the keyboard: labelled native selects and a plain button', async () => {
  const { calls } = renderSettings();
  await loaded();
  await waitFor(() => everyRole());

  const button = screen.getByRole('button', { name: 'Apply to every role' });
  expect(everyRole().tabIndex).toBe(0);
  expect(selectOf('Model').tabIndex).toBe(0);
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('type')).toBe('button');
  expect(screen.getByRole('group', { name: 'Use for every role' })).toBeTruthy();

  fireEvent.keyDown(everyRole(), { key: 'Enter' });
  expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);
});
