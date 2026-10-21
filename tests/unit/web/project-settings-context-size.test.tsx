import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-401, DEC-114, Q-23, Q-44: the Ollama context size is a field of the model settings, saved as
// `providers.ollama.contextTokens` (the provider entry, so it applies to every Ollama role).

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;

function withContext(contextTokens: 'auto' | number | undefined) {
  const base = templateSettings();
  const { kind, keySource, toolMode, timeoutSeconds, maxRetries } = base.providers.ollama;
  const rest = { kind, keySource, toolMode, timeoutSeconds, maxRetries };
  const ollama = contextTokens === undefined ? rest : { ...rest, contextTokens };
  return projectOf('p-1', 'octo/demo', {
    settings: { ...base, providers: { ollama } },
  });
}

const renderSettings = (project = withContext('auto'), answers: Record<string, Answer> = {}) =>
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, project),
      'GET /api/models/ollama': json(200, { provider: 'ollama', models: [] }),
      'GET /api/models/openai': json(200, { provider: 'openai', models: [] }),
      [`PUT ${settingsRoute}`]: json(200, project),
      ...answers,
    },
    undefined,
    { projectId: 'p-1' },
  );

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });
const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
};
const modeSelect = () => screen.getByLabelText<HTMLSelectElement>('Ollama context size');
const sizeInput = () => screen.getByLabelText<HTMLInputElement>('Ollama context size in tokens');
const choose = (value: string): void => {
  fireEvent.change(modeSelect(), { target: { value } });
};

const sentShape = z.object({
  providers: z.object({ ollama: z.object({ contextTokens: z.unknown().optional() }) }),
});

/** The contextTokens of the last saved document; 'no body' when nothing was saved. */
function sentContext(calls: readonly { method: string; body: unknown }[]): unknown {
  const parsed = sentShape.safeParse(calls.findLast((call) => call.method === 'PUT')?.body);
  return parsed.success ? parsed.data.providers.ollama.contextTokens : 'no body';
}

it('RF-401 Q-44 an Ollama role shows the Context size field on Auto and says it covers every Ollama role', async () => {
  renderSettings();
  await loaded();

  expect(modeSelect().value).toBe('auto');
  expect(screen.queryByLabelText('Ollama context size in tokens')).toBeNull();
  expect(screen.getByText(/applies to every Ollama role of this project/iu)).toBeTruthy();
});

it('RF-401 DEC-114 Auto is saved as auto', async () => {
  const { calls } = renderSettings();
  await loaded();

  save();

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe('auto');
});

it('RF-401 DEC-114 a size is saved as the number contextTokens', async () => {
  const { calls } = renderSettings();
  await loaded();

  choose('number');
  fireEvent.input(sizeInput(), { target: { value: '65536' } });
  save();

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe(65_536);
});

it('RF-401 a saved size shows as a number and going back to Auto saves auto', async () => {
  const { calls } = renderSettings(withContext(65_536));
  await loaded();
  expect(modeSelect().value).toBe('number');
  expect(sizeInput().value).toBe('65536');

  choose('auto');
  save();

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe('auto');
});

it('Q-44 saved settings without the field read as Auto and are saved without it', async () => {
  const { calls } = renderSettings(withContext(undefined));
  await loaded();
  expect(modeSelect().value).toBe('auto');

  save();

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBeUndefined();
});

it.each([
  ['2048', /at least 4,096/u],
  ['4095', /at least 4,096/u],
  ['131073', /at most 131,072/u],
  ['abc', /whole number/u],
  ['', /whole number/u],
])(
  'Q-23 a size of "%s" is refused next to the field and nothing is sent',
  async (value, message) => {
    const { calls } = renderSettings();
    await loaded();

    choose('number');
    fireEvent.input(sizeInput(), { target: { value } });
    save();

    await waitFor(() => {
      expect(screen.getByText(message)).toBeTruthy();
    });
    expect(sizeInput().getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  },
);

it.each(['4096', '131072'])('Q-23 the bound %s itself is accepted', async (value) => {
  const { calls } = renderSettings();
  await loaded();

  choose('number');
  fireEvent.input(sizeInput(), { target: { value } });
  save();

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe(Number(value));
});

it('RF-401 a refusal of the server for the field shows next to it', async () => {
  renderSettings(withContext('auto'), {
    [`PUT ${settingsRoute}`]: failure(422, 'RST-1005', [
      { field: 'providers.ollama.contextTokens', code: 'RST-1006' },
    ]),
  });
  await loaded();

  save();

  expect(await screen.findByText(/Message of RST-1006/u)).toBeTruthy();
});

it('RF-401 no field shows while no role uses Ollama, and it returns with the first one that does', async () => {
  renderSettings();
  await loaded();
  for (const role of ['Reader', 'Verifier', 'Planner', 'Summariser']) {
    fireEvent.change(screen.getByLabelText(`${role} provider`), { target: { value: 'openai' } });
  }
  expect(screen.queryByLabelText('Ollama context size')).toBeNull();

  fireEvent.change(screen.getByLabelText('Planner provider'), { target: { value: 'ollama' } });

  expect(screen.getByLabelText('Ollama context size')).toBeTruthy();
});

it('RF-401 a project with no Ollama entry yet saves the chosen size for the new entry', async () => {
  const base = templateSettings();
  const { keySource, toolMode, timeoutSeconds, maxRetries } = base.providers.ollama;
  const openai = { kind: 'openai', keySource, toolMode, timeoutSeconds, maxRetries };
  const hosted = projectOf('p-1', 'octo/demo', {
    settings: {
      ...base,
      providers: { openai },
      roles: {
        reader: { ...base.roles.reader, provider: 'openai' },
        verifier: { ...base.roles.verifier, provider: 'openai' },
        planner: { ...base.roles.planner, provider: 'openai' },
        summariser: { ...base.roles.summariser, provider: 'openai' },
      },
    },
  });
  const { calls } = renderSettings(hosted);
  await loaded();

  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: 'ollama' } });
  fireEvent.input(await screen.findByLabelText('Reader model'), {
    target: { value: 'gemma4:e4b' },
  });
  choose('number');
  fireEvent.input(sizeInput(), { target: { value: '8192' } });
  save();

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe(8192);
});

// Q-44: the number is bounded by the smallest trained context among the models of the Ollama roles.

const trainedList = (models: Readonly<Record<string, number | undefined>>): Response =>
  json(200, {
    provider: 'ollama',
    models: Object.entries(models).map(([model, trainedContext]) => ({
      model,
      label: model,
      priced: true,
      ...(trainedContext === undefined ? {} : { trainedContext }),
    })),
  });

function withVerifier(provider: string, model: string) {
  const base = templateSettings();
  const verifier = { ...base.roles.verifier, provider, model };
  return projectOf('p-1', 'octo/demo', {
    settings: { ...base, roles: { ...base.roles, verifier } },
  });
}

const listed = (): Promise<void> =>
  waitFor(() => {
    expect(screen.getByLabelText('Reader model').tagName).toBe('SELECT');
  });

async function tryTokens(value: string): Promise<void> {
  await listed();
  choose('number');
  fireEvent.input(sizeInput(), { target: { value } });
  save();
}

it('Q-44 a size above the trained context of the model is refused and the message names the model', async () => {
  const { calls } = renderSettings(withContext('auto'), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 32_768 }),
  });
  await loaded();

  await tryTokens('40000');

  expect(await screen.findByText(/gemma4:e4b was trained for 32,768 tokens/u)).toBeTruthy();
  expect(sizeInput().getAttribute('aria-invalid')).toBe('true');
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});

it('Q-44 the trained context itself is accepted', async () => {
  const { calls } = renderSettings(withContext('auto'), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 32_768 }),
  });
  await loaded();

  await tryTokens('32768');

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe(32_768);
});

it('Q-44 the bound is the smallest trained context among the Ollama roles', async () => {
  renderSettings(withVerifier('ollama', 'qwen3:8b'), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 131_072, 'qwen3:8b': 16_384 }),
  });
  await loaded();

  await tryTokens('32768');

  expect(await screen.findByText(/qwen3:8b was trained for 16,384 tokens/u)).toBeTruthy();
});

it('Q-44 a model of another provider does not set the bound', async () => {
  const { calls } = renderSettings(withVerifier('openai', 'tiny'), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 65_536, tiny: 4096 }),
  });
  await loaded();

  await tryTokens('65536');

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe(65_536);
});

it('Q-44 a trained context above 131,072 is the bound when it is the smallest', async () => {
  const { calls } = renderSettings(withContext('auto'), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 262_144 }),
  });
  await loaded();

  await tryTokens('200000');

  await screen.findByText('Settings saved.');
  expect(sentContext(calls)).toBe(200_000);
});

it.each([
  ['a model that names no trained context', { 'gemma4:e4b': undefined }],
  ['a model that is not installed', { 'qwen3:8b': 8192 }],
])('Q-44 with %s the bound falls back to 131,072', async (_name, models) => {
  renderSettings(withContext('auto'), { 'GET /api/models/ollama': trainedList(models) });
  await loaded();

  await tryTokens('131073');

  expect(await screen.findByText(/at most 131,072 tokens\./u)).toBeTruthy();
});

it('Q-44 the bound is also in the help of the field', async () => {
  renderSettings(withContext('auto'), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 32_768 }),
  });
  await loaded();

  await listed();

  expect(await screen.findByText(/up to 32,768 tokens/u)).toBeTruthy();
});
