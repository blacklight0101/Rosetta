import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// Q-44, RF-401: in a project's settings the Ollama context size is bounded by the smallest trained
// context among the models of the Ollama roles, from the model list; 131,072 when none is known.

const route = '/api/projects/p-1';

const renderSettings = (project: ReturnType<typeof projectOf>, answers: Record<string, Answer>) =>
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, project),
      'GET /api/models/openai': json(200, { provider: 'openai', models: [] }),
      [`PUT ${route}/settings`]: json(200, project),
      ...answers,
    },
    undefined,
    { projectId: 'p-1' },
  );

const withContext = () => projectOf('p-1', 'octo/demo', { settings: templateSettings() });
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

function sentContext(calls: readonly { method: string; body: unknown }[]): unknown {
  const parsed = sentShape.safeParse(calls.findLast((call) => call.method === 'PUT')?.body);
  return parsed.success ? parsed.data.providers.ollama.contextTokens : 'no body';
}

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
  const { calls } = renderSettings(withContext(), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 32_768 }),
  });
  await loaded();

  await tryTokens('40000');

  expect(await screen.findByText(/gemma4:e4b was trained for 32,768 tokens/u)).toBeTruthy();
  expect(sizeInput().getAttribute('aria-invalid')).toBe('true');
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});

it('Q-44 the trained context itself is accepted', async () => {
  const { calls } = renderSettings(withContext(), {
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
  const { calls } = renderSettings(withContext(), {
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
  renderSettings(withContext(), { 'GET /api/models/ollama': trainedList(models) });
  await loaded();

  await tryTokens('131073');

  expect(await screen.findByText(/at most 131,072 tokens\./u)).toBeTruthy();
});

it('Q-44 the bound is also in the help of the field', async () => {
  renderSettings(withContext(), {
    'GET /api/models/ollama': trainedList({ 'gemma4:e4b': 32_768 }),
  });
  await loaded();

  await listed();

  expect(await screen.findByText(/up to 32,768 tokens/u)).toBeTruthy();
});
