import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { failure, json, type Answer, type RenderedPage } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';
import { estimatePath, projectPath } from './start-run-fixtures.js';
import { renderStart } from './start-run-helpers.js';

// RF-436, P8-75: the start page shows the warning of the project settings page when a role's
// provider cannot be used now (an unreachable Ollama, a provider with no key the user can use). The
// start page has no roles of its own and no Save, so Apply in the warning saves the project
// settings at once and says so; the warning itself changes nothing (DEC-106).

const settingsRoute = `${projectPath}/settings`;

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

/** The project with every role on one provider and model; the template has them on Ollama. */
function projectWithRoles(provider: string, model: string): Record<string, unknown> {
  const settings = templateSettings();
  const on = <Role extends object>(role: Role) => ({ ...role, provider, model });
  const { reader, verifier, planner, summariser } = settings.roles;
  return projectOf('p-1', 'octo/demo', {
    settings: {
      ...settings,
      roles: {
        ...settings.roles,
        ...{ reader: on(reader), verifier: on(verifier) },
        ...{ planner: on(planner), summariser: on(summariser) },
      },
    },
    settingsVersion: 2,
  });
}

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

const renderWarned = (answers: Readonly<Record<string, Answer>> = {}) =>
  renderStart({
    'GET /api/models/ollama': unreachable,
    'GET /api/models/anthropic': anthropic,
    'GET /api/models/openai': openai,
    'GET /api/account/key-access': keyAccess({ anthropic: 'own' }),
    ...answers,
  });

function selectOf(label: string): HTMLSelectElement {
  const field = screen.getByLabelText(label, { exact: true });
  if (!(field instanceof HTMLSelectElement)) throw new Error(`${label} is not a select.`);
  return field;
}

const warning = () => screen.findByRole('alert');
const puts = (calls: RenderedPage['calls']) => calls.filter((call) => call.method === 'PUT');

function rolesIn(body: unknown): unknown {
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'roles') : undefined;
}

it('RF-436 the start page warns that an unreachable Ollama is used by all four roles, and offers the every-role control', async () => {
  const { calls } = renderWarned();

  const alert = await warning();
  expect(alert.textContent).toContain(
    'Ollama cannot be reached. All four roles use it, so a run would fail at its first call.',
  );
  expect(alert.textContent).toContain('You have an Anthropic key.');
  expect(alert.textContent).toContain(
    'Apply to every role saves this choice in the project settings, so every run of this project uses it.',
  );
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
  // The warning changes no role by itself (DEC-106).
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(puts(calls)).toEqual([]);
});

/** The project as another session saved it after the page read it: a new cap and version 2. */
function savedElsewhere(): Record<string, unknown> {
  const settings = templateSettings();
  const budget = { ...settings.budget, run: { ...settings.budget.run, maxCostMicros: 900_000 } };
  return projectOf('p-1', 'octo/demo', { settings: { ...settings, budget }, settingsVersion: 2 });
}

it('RF-436 Apply in the start-page warning saves every role on Anthropic with its recommended model in the project settings', async () => {
  let elsewhere = false;
  let saved = false;
  const { calls } = renderWarned({
    [`GET ${projectPath}`]: () => {
      if (saved) return json(200, projectWithRoles('anthropic', 'claude-haiku-5-5'));
      return json(200, elsewhere ? savedElsewhere() : projectOf('p-1', 'octo/demo'));
    },
    [`PUT ${settingsRoute}`]: () => {
      saved = true;
      return json(200, projectWithRoles('anthropic', 'claude-haiku-5-5'));
    },
  });
  await warning();
  await waitFor(() => {
    expect(selectOf('Provider for every role').value).toBe('anthropic');
  });
  const estimatesBefore = calls.filter((call) => call.path.startsWith(estimatePath)).length;
  // Another session saves the settings after the page read them; Apply reads them again.
  elsewhere = true;

  fireEvent.click(screen.getByRole('button', { name: 'Apply to every role' }));

  const line = await screen.findByText(
    'Saved in the project settings: every role now uses Anthropic.',
  );
  const [put] = puts(calls);
  expect(put?.ifMatch).toBe('"2"');
  const template = templateSettings();
  const haiku = { provider: 'anthropic', model: 'claude-haiku-5-5' };
  expect(rolesIn(put?.body)).toEqual({
    ...template.roles,
    reader: { ...template.roles.reader, ...haiku },
    verifier: { ...template.roles.verifier, ...haiku },
    planner: { ...template.roles.planner, ...haiku },
    summariser: { ...template.roles.summariser, ...haiku },
  });
  // What the other session saved stays.
  const budget = { ...template.budget, run: { ...template.budget.run, maxCostMicros: 900_000 } };
  expect(put?.body).toMatchObject({ agents: template.agents, budget });
  expect(screen.queryByRole('alert')).toBeNull();
  await waitFor(() => {
    expect(document.activeElement).toBe(line);
  });
  await waitFor(() => {
    expect(calls.filter((call) => call.path.startsWith(estimatePath)).length).toBeGreaterThan(
      estimatesBefore,
    );
  });
});

it('RF-436 a refused save from the start-page warning changes nothing and shows its error', async () => {
  renderWarned({ [`PUT ${settingsRoute}`]: failure(409, 'RST-1007') });
  await warning();
  await waitFor(() => {
    expect(selectOf('Provider for every role').value).toBe('anthropic');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Apply to every role' }));

  await waitFor(() => {
    expect(screen.getByTestId('error-banner').textContent).toContain('RST-1007');
  });
  const alert = screen
    .getAllByRole('alert')
    .find((each) => each.textContent.includes('Ollama cannot be reached.'));
  expect(alert).toBeDefined();
  expect(screen.queryByText(/^Saved in the project settings/u)).toBeNull();
});

it('RF-436 the start page warns about a provider with no key and names the one role that uses it', async () => {
  renderWarned({
    [`GET ${projectPath}`]: plannerOnOpenAi(),
    'GET /api/models/ollama': installed,
    'GET /api/account/key-access': keyAccess({ anthropic: 'server' }),
  });

  const alert = await warning();
  expect(alert.textContent).toContain(
    'OpenAI has no key you can use. The planner uses it, so a run would be refused (RST-2302).',
  );
  expect(alert.textContent).toContain('Ollama can be reached.');
  expect(alert.textContent).not.toContain('cannot be reached');
  expect(within(alert).getByRole('button', { name: 'Apply to every role' })).toBeDefined();
});

it('RF-436 the start page shows no warning when every role can be used', async () => {
  const { calls } = renderWarned({ 'GET /api/models/ollama': installed });

  await waitFor(() => {
    expect(calls.some((call) => call.path === '/api/account/key-access')).toBe(true);
    expect(calls.some((call) => call.path === '/api/models/ollama')).toBe(true);
  });
  await screen.findByRole('table', { name: 'Estimate per role' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByLabelText('Provider for every role')).toBeNull();
});
