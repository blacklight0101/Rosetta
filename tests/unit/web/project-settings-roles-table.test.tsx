import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, P8-135, the Roles table of the `P8ProjectSettings` artboard (DEC-211, DEC-224): the roles
// are one table with the columns Role, Provider, Model and State, a row per role in the order of
// the artboard; the provider and the model are chosen in the row under the labels of before, and
// the State says whether the role's provider can be used now, by the rule of the warning (P8-74).

const route = '/api/projects/p-1';
const demo = projectOf('p-1', 'octo/demo');

const anthropic = json(200, {
  provider: 'anthropic',
  models: [{ model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', priced: true }],
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

function keyAccess(own: readonly string[]): Response {
  const providers = (['anthropic', 'openai', 'openai-compatible'] as const).map((provider) => ({
    provider,
    ownKey: own.includes(provider),
    serverKey: false,
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
      'GET /api/account/key-access': keyAccess(['anthropic']),
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

const roles = ['Reader', 'Verifier', 'Planner', 'Summariser'] as const;

const rolesTable = () => screen.findByRole('table', { name: 'Roles' });

function rowOf(role: string): HTMLElement {
  const row = screen.getByRole('rowheader', { name: role }).closest('tr');
  if (row === null) throw new Error(`No row for ${role}.`);
  return row;
}

/** The text of the State cell of a role, the last cell of its row. */
const stateOf = (role: string): string =>
  within(rowOf(role)).getAllByRole('cell').at(-1)?.textContent.trim() ?? '';

it('RF-436 the Roles section is one table with the columns and the rows of the artboard', async () => {
  renderSettings();
  const table = await rolesTable();

  expect(screen.getByRole('heading', { name: 'Roles', level: 2 })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Models per role' })).toBeNull();
  expect(
    screen.getByText(
      'Choosing a provider selects its recommended model; change it if you want another.',
    ),
  ).toBeTruthy();
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent),
  ).toEqual(['Role', 'Provider', 'Model', 'State']);
  expect(
    within(table)
      .getAllByRole('rowheader')
      .map((header) => header.textContent),
  ).toEqual([...roles]);
  for (const role of roles) {
    const row = rowOf(role);
    expect(within(row).getByLabelText(`${role} provider`, { exact: true })).toBeTruthy();
    expect(within(row).getByLabelText(`${role} model`, { exact: true })).toBeTruthy();
    // The limits stay in the section, under the table.
    const limit = screen.getByLabelText(`${role} max output tokens`, { exact: true });
    expect(table.contains(limit)).toBe(false);
  }
  expect(table.contains(screen.getByLabelText('Reader max turns', { exact: true }))).toBe(false);
});

it('RF-436 every role on an Ollama that cannot be reached reads Not reachable', async () => {
  renderSettings();
  await rolesTable();

  await waitFor(() => {
    expect(roles.map(stateOf)).toEqual([
      'Not reachable',
      'Not reachable',
      'Not reachable',
      'Not reachable',
    ]);
  });
});

it('RF-436 a provider with no key reads No key, and a reachable Ollama reads Reachable', async () => {
  renderSettings({
    [`GET ${route}`]: plannerOnOpenAi(),
    'GET /api/models/ollama': installed,
  });
  await rolesTable();

  await waitFor(() => {
    expect(roles.map(stateOf)).toEqual(['Reachable', 'Reachable', 'No key', 'Reachable']);
  });
});

it('RF-436 choosing a provider in a row changes its State at once, before any save', async () => {
  const { calls } = renderSettings();
  await rolesTable();
  await waitFor(() => {
    expect(stateOf('Reader')).toBe('Not reachable');
  });

  fireEvent.change(screen.getByLabelText('Reader provider', { exact: true }), {
    target: { value: 'anthropic' },
  });

  await waitFor(() => {
    expect(stateOf('Reader')).toBe('Key ready');
  });
  expect(stateOf('Verifier')).toBe('Not reachable');
  expect(calls.filter((call) => call.method === 'PUT')).toEqual([]);
});

it('RF-436 a State waits for the answer it rests on', async () => {
  renderSettings({
    [`GET ${route}`]: plannerOnOpenAi(),
    'GET /api/account/key-access': () => new Promise<Response>(() => undefined),
  });
  await rolesTable();

  await waitFor(() => {
    expect(stateOf('Reader')).toBe('Not reachable');
  });
  expect(stateOf('Planner')).toBe('');
});

it('RF-436 with no warning, the every-role control stands above the table', async () => {
  renderSettings({ 'GET /api/models/ollama': installed });
  const table = await rolesTable();

  const control = await screen.findByRole('group', { name: 'Use for every role' });
  expect(control.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
